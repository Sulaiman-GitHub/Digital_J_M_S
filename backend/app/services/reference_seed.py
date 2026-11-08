"""Seeding reference data from scripts/data/*.csv. Safe to run any number of times.

Rows are matched by their unique name. A re-run adds new rows and updates changed region, type,
district and rank; it never deletes rows and never switches `is_active` back on.
"""

import csv
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import Select, func, literal_column, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import (
    District,
    FieldOfStudy,
    Institution,
    InstitutionType,
    QualificationLevel,
    Skill,
)
from app.services.reference import normalise_name

REGIONS = ("Central", "Eastern", "Northern", "Western")

TABLES: dict[str, type] = {
    "districts": District,
    "qualification_levels": QualificationLevel,
    "institutions": Institution,
    "fields_of_study": FieldOfStudy,
    "skills": Skill,
}


class SeedDataError(Exception):
    """The CSV files are wrong. The message says which file and which row."""


@dataclass(frozen=True)
class SeedCounts:
    inserted: int
    updated: int
    unchanged: int


def read_rows(
    path: Path, columns: Sequence[str], optional: Sequence[str] = ()
) -> list[dict[str, str]]:
    """Rows of a CSV as stripped strings. Blank lines are skipped."""
    if not path.is_file():
        raise SeedDataError(f"Missing data file: {path.name}")
    with path.open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        header = [name.strip() for name in (reader.fieldnames or [])]
        missing = [c for c in columns if c not in header]
        if missing:
            raise SeedDataError(f"{path.name}: missing column(s) {', '.join(missing)}")
        rows = []
        for number, raw in enumerate(reader, start=2):
            row = {key.strip(): (value or "").strip() for key, value in raw.items() if key}
            if not any(row.values()):
                continue
            for column in columns:
                if column not in optional and not row.get(column):
                    raise SeedDataError(f"{path.name} line {number}: '{column}' is empty")
            rows.append(row)
    return rows


def _reject_duplicates(path: Path, names: Sequence[str], what: str) -> None:
    seen: set[str] = set()
    for name in names:
        if name in seen:
            raise SeedDataError(f"{path.name}: duplicate {what} '{name}'")
        seen.add(name)


def _upsert(
    db: Session,
    model: type,
    rows: list[dict[str, Any]],
    *,
    key: str,
    update: Sequence[str],
) -> SeedCounts:
    """INSERT ... ON CONFLICT on `key`; changed `update` columns are overwritten, nothing else."""
    if not rows:
        return SeedCounts(0, 0, 0)
    statement = insert(model).values(rows)
    key_column = getattr(model, key)
    if update:
        excluded = statement.excluded
        changed = or_(*[getattr(model, c).is_distinct_from(getattr(excluded, c)) for c in update])
        statement = statement.on_conflict_do_update(
            index_elements=[key_column],
            set_={**{c: getattr(excluded, c) for c in update}, "updated_at": func.now()},
            where=changed,  # unchanged rows are left alone (and not counted as updated)
        )
    else:
        statement = statement.on_conflict_do_nothing(index_elements=[key_column])
    # xmax = 0 is true for a freshly inserted row and false for one updated by ON CONFLICT.
    result = db.execute(statement.returning(literal_column("(xmax = 0)").label("inserted"))).all()
    inserted = sum(1 for row in result if row.inserted)
    return SeedCounts(inserted, len(result) - inserted, len(rows) - len(result))


def seed_districts(db: Session, data_dir: Path) -> SeedCounts:
    path = data_dir / "districts.csv"
    rows = read_rows(path, ["name", "region"])
    _reject_duplicates(path, [r["name"] for r in rows], "district")
    for number, row in enumerate(rows, start=2):
        if row["region"] not in REGIONS:
            raise SeedDataError(f"{path.name} line {number}: region must be one of {REGIONS}")
    return _upsert(db, District, rows, key="name", update=["region"])


def seed_qualification_levels(db: Session, data_dir: Path) -> SeedCounts:
    path = data_dir / "qualification_levels.csv"
    rows = read_rows(path, ["name", "rank"])
    _reject_duplicates(path, [r["name"] for r in rows], "qualification level")
    _reject_duplicates(path, [r["rank"] for r in rows], "rank")
    values = []
    for number, row in enumerate(rows, start=2):
        if not row["rank"].isdigit() or int(row["rank"]) < 1:
            raise SeedDataError(f"{path.name} line {number}: rank must be a positive whole number")
        values.append({"name": row["name"], "rank": int(row["rank"])})
    return _upsert(db, QualificationLevel, values, key="name", update=["rank"])


def seed_institutions(db: Session, data_dir: Path) -> SeedCounts:
    path = data_dir / "institutions.csv"
    rows = read_rows(path, ["name", "institution_type", "district"], optional=["district"])
    _reject_duplicates(path, [r["name"] for r in rows], "institution")
    district_ids = {name: id_ for name, id_ in db.execute(select(District.name, District.id))}
    valid_types = {t.value: t for t in InstitutionType}
    values = []
    for number, row in enumerate(rows, start=2):
        if row["institution_type"] not in valid_types:
            raise SeedDataError(
                f"{path.name} line {number}: institution_type must be one of {sorted(valid_types)}"
            )
        district = row["district"]
        if district and district not in district_ids:
            raise SeedDataError(f"{path.name} line {number}: unknown district '{district}'")
        values.append(
            {
                "name": row["name"],
                "institution_type": valid_types[row["institution_type"]],
                "district_id": district_ids.get(district) if district else None,
            }
        )
    return _upsert(db, Institution, values, key="name", update=["institution_type", "district_id"])


def seed_fields_of_study(db: Session, data_dir: Path) -> SeedCounts:
    path = data_dir / "fields_of_study.csv"
    rows = read_rows(path, ["name"])
    _reject_duplicates(path, [r["name"] for r in rows], "field of study")
    return _upsert(db, FieldOfStudy, rows, key="name", update=[])


def seed_skills(db: Session, data_dir: Path) -> SeedCounts:
    path = data_dir / "skills.csv"
    rows = read_rows(path, ["name"])
    values = [{"name": r["name"], "name_normalized": normalise_name(r["name"])} for r in rows]
    _reject_duplicates(path, [v["name_normalized"] for v in values], "skill (ignoring case)")
    return _upsert(db, Skill, values, key="name_normalized", update=["name"])


def seed_reference(db: Session, data_dir: Path) -> dict[str, SeedCounts]:
    """Seed every table, districts first (institutions refer to them)."""
    return {
        "districts": seed_districts(db, data_dir),
        "qualification_levels": seed_qualification_levels(db, data_dir),
        "institutions": seed_institutions(db, data_dir),
        "fields_of_study": seed_fields_of_study(db, data_dir),
        "skills": seed_skills(db, data_dir),
    }


def table_totals(db: Session) -> dict[str, int]:
    def count(model: type) -> int:
        statement: Select[tuple[int]] = select(func.count()).select_from(model)
        return db.scalar(statement) or 0

    return {name: count(model) for name, model in TABLES.items()}

"""Seeding is idempotent, never reactivates, and refuses bad files."""

import shutil
import uuid
from pathlib import Path

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import District, FieldOfStudy, Institution, QualificationLevel, Skill
from app.services.reference_seed import SeedDataError, seed_reference, table_totals

REAL_DATA = Path(__file__).resolve().parents[3] / "scripts" / "data"


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    """A private copy of the real CSVs that a test can edit."""
    target = tmp_path / "data"
    shutil.copytree(REAL_DATA, target, ignore=shutil.ignore_patterns("README.md"))
    return target


def csv_rows(directory: Path, name: str) -> int:
    lines = (directory / f"{name}.csv").read_text(encoding="utf-8").splitlines()
    return len([line for line in lines[1:] if line.strip()])


def ids(db: Session, model: type) -> dict[str, uuid.UUID]:
    key = Skill.name_normalized if model is Skill else model.name  # type: ignore[attr-defined]
    return dict(db.execute(select(key, model.id)).all())  # type: ignore[attr-defined]


def test_first_seed_adds_every_row(db_session: Session, data_dir: Path) -> None:
    counts = seed_reference(db_session, data_dir)

    for table in ("districts", "qualification_levels", "institutions", "fields_of_study", "skills"):
        assert counts[table].inserted == csv_rows(data_dir, table), table
        assert counts[table].updated == counts[table].unchanged == 0
    assert table_totals(db_session) == {
        name: csv_rows(data_dir, name) for name in table_totals(db_session)
    }


def test_seeding_twice_changes_nothing_and_keeps_ids(db_session: Session, data_dir: Path) -> None:
    seed_reference(db_session, data_dir)
    before = {m: ids(db_session, m) for m in (District, Institution, FieldOfStudy, Skill)}
    totals = table_totals(db_session)

    second = seed_reference(db_session, data_dir)

    assert all(c.inserted == c.updated == 0 for c in second.values())
    assert table_totals(db_session) == totals
    assert {m: ids(db_session, m) for m in before} == before  # same UUIDs: nothing was recreated


def test_institutions_are_linked_to_their_district(db_session: Session, data_dir: Path) -> None:
    seed_reference(db_session, data_dir)

    makerere = db_session.scalars(
        select(Institution).where(Institution.name == "Makerere University")
    ).one()
    kampala = db_session.scalars(select(District).where(District.name == "Kampala")).one()
    no_district = db_session.scalars(
        select(Institution).where(Institution.name == "Uganda Technical College Elgon")
    ).one()

    assert makerere.district_id == kampala.id
    assert no_district.district_id is None


def test_changed_values_are_updated_in_place(db_session: Session, data_dir: Path) -> None:
    seed_reference(db_session, data_dir)
    gulu_id = ids(db_session, District)["Gulu"]
    path = data_dir / "districts.csv"
    path.write_text(path.read_text(encoding="utf-8").replace("Gulu,Northern", "Gulu,Eastern"))

    counts = seed_reference(db_session, data_dir)

    assert (counts["districts"].inserted, counts["districts"].updated) == (0, 1)
    gulu = db_session.get_one(District, gulu_id)
    db_session.refresh(gulu)
    assert gulu.region == "Eastern"
    assert gulu.updated_at >= gulu.created_at


def test_new_rows_in_a_csv_are_added(db_session: Session, data_dir: Path) -> None:
    seed_reference(db_session, data_dir)
    path = data_dir / "skills.csv"
    path.write_text(path.read_text(encoding="utf-8") + "Beekeeping\n")

    counts = seed_reference(db_session, data_dir)

    assert (counts["skills"].inserted, counts["skills"].updated) == (1, 0)
    assert db_session.scalar(select(Skill).where(Skill.name_normalized == "beekeeping"))


def test_a_skill_changing_only_its_capitalisation_updates_the_display_name(
    db_session: Session, data_dir: Path
) -> None:
    seed_reference(db_session, data_dir)
    path = data_dir / "skills.csv"
    path.write_text(path.read_text(encoding="utf-8").replace("Microsoft Excel", "microsoft excel"))

    counts = seed_reference(db_session, data_dir)

    assert (counts["skills"].inserted, counts["skills"].updated) == (0, 1)
    skill = db_session.scalars(
        select(Skill).where(Skill.name_normalized == "microsoft excel")
    ).one()
    assert skill.name == "microsoft excel"


def test_deactivated_rows_stay_deactivated_after_reseeding(
    db_session: Session, data_dir: Path
) -> None:
    seed_reference(db_session, data_dir)
    db_session.execute(update(Skill).where(Skill.name_normalized == "luo").values(is_active=False))
    db_session.execute(
        update(Institution).where(Institution.name == "Lira University").values(is_active=False)
    )
    db_session.execute(
        update(FieldOfStudy).where(FieldOfStudy.name == "Law").values(is_active=False)
    )

    seed_reference(db_session, data_dir)
    seed_reference(db_session, data_dir)

    def active(model: type, column: object, value: str) -> bool:
        return db_session.scalar(select(model.is_active).where(column == value))  # type: ignore[attr-defined]

    assert active(Skill, Skill.name_normalized, "luo") is False
    assert active(Institution, Institution.name, "Lira University") is False
    assert active(FieldOfStudy, FieldOfStudy.name, "Law") is False


def test_nothing_is_ever_deleted_when_a_row_leaves_the_csv(
    db_session: Session, data_dir: Path
) -> None:
    seed_reference(db_session, data_dir)
    path = data_dir / "fields_of_study.csv"
    path.write_text(path.read_text(encoding="utf-8").replace("Law\n", ""))

    seed_reference(db_session, data_dir)

    assert db_session.scalar(select(FieldOfStudy).where(FieldOfStudy.name == "Law")) is not None


def test_database_enforces_unique_names_and_ranks(db_session: Session, data_dir: Path) -> None:
    seed_reference(db_session, data_dir)

    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(District(name="Kampala", region="Central"))
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(QualificationLevel(name="Another level", rank=1))
    with pytest.raises(IntegrityError):  # same skill, different spelling
        with db_session.begin_nested():
            db_session.add(Skill(name="PYTHON", name_normalized="python"))


def test_database_requires_normalised_skill_names(db_session: Session) -> None:
    db_session.add(Skill(name="Python", name_normalized="Python"))

    with pytest.raises(IntegrityError, match="ck_skills_name_normalized_is_normalized"):
        db_session.flush()


def test_qualification_rank_must_be_positive(db_session: Session) -> None:
    db_session.add(QualificationLevel(name="Pre-school", rank=0))

    with pytest.raises(IntegrityError, match="ck_qualification_levels_rank_positive"):
        db_session.flush()


def test_institution_type_is_checked_by_the_database(db_session: Session) -> None:
    from sqlalchemy import text

    with pytest.raises(IntegrityError, match="ck_institutions_institution_type"):
        db_session.execute(
            text("INSERT INTO institutions (name, institution_type) VALUES ('X', 'madeup')")
        )


# ---------- bad files are refused with a clear message, and nothing is written ----------


def edit(data_dir: Path, file_name: str, old: str, new: str) -> None:
    path = data_dir / f"{file_name}.csv"
    text = path.read_text(encoding="utf-8")
    assert old in text, f"test setup: {old!r} not in {file_name}.csv"
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


@pytest.mark.parametrize(
    ("file_name", "old", "new", "message"),
    [
        ("districts", "Gulu,Northern", "Gulu,Narnia", "region must be one of"),
        ("districts", "Gulu,Northern", "Kampala,Northern", "duplicate district 'Kampala'"),
        ("districts", "Gulu,Northern", "Gulu,", "'region' is empty"),
        ("qualification_levels", "Diploma,2", "Diploma,two", "rank must be a positive"),
        ("qualification_levels", "Diploma,2", "Diploma,1", "duplicate rank '1'"),
        (
            "institutions",
            "Makerere University,university",
            "Makerere University,school",
            "institution_type",
        ),
        (
            "institutions",
            "Makerere University,university,Kampala",
            "Makerere University,university,Atlantis",
            "unknown district 'Atlantis'",
        ),
        ("fields_of_study", "Law\n", "Law\nLaw\n", "duplicate field of study 'Law'"),
        ("skills", "Python\n", "Python\nPYTHON\n", "duplicate skill (ignoring case)"),
    ],
)
def test_bad_data_files_are_refused(
    db_session: Session, data_dir: Path, file_name: str, old: str, new: str, message: str
) -> None:
    edit(data_dir, file_name, old, new)

    with pytest.raises(SeedDataError, match=message.replace("(", r"\(").replace(")", r"\)")):
        seed_reference(db_session, data_dir)


def test_a_missing_file_or_column_is_refused(db_session: Session, data_dir: Path) -> None:
    (data_dir / "skills.csv").unlink()
    with pytest.raises(SeedDataError, match="Missing data file: skills.csv"):
        seed_reference(db_session, data_dir)

    (data_dir / "skills.csv").write_text("label\nPython\n", encoding="utf-8")
    with pytest.raises(SeedDataError, match="missing column"):
        seed_reference(db_session, data_dir)


def test_total_row_count_matches_what_the_api_tables_hold(
    db_session: Session, data_dir: Path
) -> None:
    seed_reference(db_session, data_dir)

    assert db_session.scalar(select(func.count()).select_from(Skill)) == csv_rows(
        data_dir, "skills"
    )

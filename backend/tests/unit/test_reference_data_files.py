"""Quality checks on the real seed files in scripts/data (no database needed).

They catch typos that would otherwise show up in every dropdown of the app.
"""

from pathlib import Path

import pytest

from app.models import InstitutionType
from app.services.reference import normalise_name
from app.services.reference_seed import REGIONS, read_rows

DATA_DIR = Path(__file__).resolve().parents[3] / "scripts" / "data"


@pytest.fixture(scope="module")
def districts() -> list[dict[str, str]]:
    return read_rows(DATA_DIR / "districts.csv", ["name", "region"])


@pytest.fixture(scope="module")
def institutions() -> list[dict[str, str]]:
    return read_rows(
        DATA_DIR / "institutions.csv", ["name", "institution_type", "district"], ["district"]
    )


@pytest.fixture(scope="module")
def skills() -> list[dict[str, str]]:
    return read_rows(DATA_DIR / "skills.csv", ["name"])


@pytest.fixture(scope="module")
def fields() -> list[dict[str, str]]:
    return read_rows(DATA_DIR / "fields_of_study.csv", ["name"])


@pytest.fixture(scope="module")
def levels() -> list[dict[str, str]]:
    return read_rows(DATA_DIR / "qualification_levels.csv", ["name", "rank"])


def test_the_review_notice_exists() -> None:
    readme = (DATA_DIR / "README.md").read_text(encoding="utf-8")

    assert "TO BE REVIEWED" in readme


def test_districts_are_unique_and_in_a_known_region(districts: list[dict[str, str]]) -> None:
    names = [d["name"] for d in districts]

    assert len(names) == len(set(names))
    assert len(names) >= 100
    assert {d["region"] for d in districts} == set(REGIONS)
    assert "Kampala" in names


def test_qualification_levels_are_ranked_one_to_six_in_order(levels: list[dict[str, str]]) -> None:
    ordered = sorted(levels, key=lambda row: int(row["rank"]))

    assert [int(row["rank"]) for row in ordered] == [1, 2, 3, 4, 5, 6]
    assert [row["name"] for row in ordered][0] == "Certificate"
    assert [row["name"] for row in ordered][-1] == "Doctorate"


def test_institutions_have_valid_types_and_known_districts(
    institutions: list[dict[str, str]], districts: list[dict[str, str]]
) -> None:
    district_names = {d["name"] for d in districts}
    names = [i["name"] for i in institutions]

    assert len(names) == len(set(names))
    assert {i["institution_type"] for i in institutions} <= {t.value for t in InstitutionType}
    assert all(i["district"] in district_names for i in institutions if i["district"])
    assert len(institutions) >= 30


def test_fields_of_study_are_unique(fields: list[dict[str, str]]) -> None:
    names = [f["name"] for f in fields]

    assert len(names) == len({n.lower() for n in names})
    assert len(names) >= 50


def test_skills_are_unique_ignoring_case_and_include_the_expected_examples(
    skills: list[dict[str, str]],
) -> None:
    normalised = [normalise_name(s["name"]) for s in skills]

    assert len(normalised) == len(set(normalised))
    assert len(normalised) >= 100
    for example in ("microsoft excel", "communication", "customer service", "python", "accounting"):
        assert example in normalised
    assert "teaching" in normalised


@pytest.mark.parametrize(
    "file_name", ["districts", "qualification_levels", "institutions", "fields_of_study", "skills"]
)
def test_no_name_has_stray_whitespace_or_odd_characters(file_name: str) -> None:
    text = (DATA_DIR / f"{file_name}.csv").read_text(encoding="utf-8")

    assert "\t" not in text and "﻿" not in text and "\r\r" not in text
    for line in text.splitlines()[1:]:
        assert line == line.strip(), f"stray space in {file_name}.csv: {line!r}"
        assert "  " not in line, f"double space in {file_name}.csv: {line!r}"

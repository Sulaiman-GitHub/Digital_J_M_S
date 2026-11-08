"""Public reference lists: ordering, search, caching. No login is needed."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import District, FieldOfStudy, Institution, InstitutionType, Skill
from app.services.reference_seed import seed_reference

REAL_DATA = Path(__file__).resolve().parents[3] / "scripts" / "data"
BASE = "/api/v1/reference"


@pytest.fixture
def seeded(db_session: Session) -> Session:
    seed_reference(db_session, REAL_DATA)
    return db_session


def names(response) -> list[str]:  # type: ignore[no-untyped-def]
    return [row["name"] for row in response.json()["data"]]


# ---------- the lists ----------


def test_lists_need_no_login(client: TestClient, seeded: Session) -> None:
    for path in ("districts", "qualification-levels", "institutions", "fields-of-study", "skills"):
        assert client.get(f"{BASE}/{path}").status_code == 200, path


def test_districts_are_listed_alphabetically_with_ids_and_regions(
    client: TestClient, seeded: Session
) -> None:
    data = client.get(f"{BASE}/districts").json()["data"]

    listed = [d["name"] for d in data]
    assert listed == sorted(listed, key=str.lower)
    assert len(data) >= 100
    kampala = next(d for d in data if d["name"] == "Kampala")
    assert kampala["region"] == "Central"
    assert len(kampala["id"]) == 36  # a UUID
    assert set(kampala) == {"id", "name", "region"}


def test_qualification_levels_are_ordered_by_rank(client: TestClient, seeded: Session) -> None:
    data = client.get(f"{BASE}/qualification-levels").json()["data"]

    assert [(row["rank"], row["name"]) for row in data] == [
        (1, "Certificate"),
        (2, "Diploma"),
        (3, "Bachelor's degree"),
        (4, "Postgraduate diploma"),
        (5, "Master's degree"),
        (6, "Doctorate"),
    ]


def test_ranks_come_from_the_database_not_from_the_alphabet(
    client: TestClient, db_session: Session
) -> None:
    from app.models import QualificationLevel

    db_session.add_all(
        [
            QualificationLevel(name="Zebra level", rank=1),
            QualificationLevel(name="Alpha level", rank=2),
        ]
    )
    db_session.flush()

    assert names(client.get(f"{BASE}/qualification-levels")) == ["Zebra level", "Alpha level"]


def test_institutions_show_type_and_district_and_hide_inactive_ones(
    client: TestClient, seeded: Session
) -> None:
    seeded.execute(
        update(Institution).where(Institution.name == "Lira University").values(is_active=False)
    )
    data = client.get(f"{BASE}/institutions").json()["data"]

    listed = [i["name"] for i in data]
    assert "Lira University" not in listed
    assert listed == sorted(listed, key=str.lower)
    makerere = next(i for i in data if i["name"] == "Makerere University")
    assert makerere["institution_type"] == "university"
    kampala_id = next(
        d["id"] for d in client.get(f"{BASE}/districts").json()["data"] if d["name"] == "Kampala"
    )
    assert makerere["district_id"] == kampala_id
    elgon = next(i for i in data if i["name"] == "Uganda Technical College Elgon")
    assert elgon["district_id"] is None
    assert {i["institution_type"] for i in data} <= {t.value for t in InstitutionType}


def test_fields_of_study_hide_inactive_ones(client: TestClient, seeded: Session) -> None:
    seeded.execute(update(FieldOfStudy).where(FieldOfStudy.name == "Law").values(is_active=False))

    listed = names(client.get(f"{BASE}/fields-of-study"))

    assert "Law" not in listed and "Nursing" in listed
    assert listed == sorted(listed, key=str.lower)


def test_a_small_list_is_ordered_ignoring_case(client: TestClient, db_session: Session) -> None:
    db_session.add_all(
        [District(name=n, region="Central") for n in ("charlie", "Bravo", "alpha", "Delta")]
    )
    db_session.flush()

    assert names(client.get(f"{BASE}/districts")) == ["alpha", "Bravo", "charlie", "Delta"]


# ---------- skill search ----------


def test_skill_search_is_case_insensitive_and_matches_anywhere(
    client: TestClient, seeded: Session
) -> None:
    result = names(client.get(f"{BASE}/skills", params={"q": "EXCEL"}))

    assert "Microsoft Excel" in result
    assert all("excel" in n.lower() for n in result)


def test_skill_search_puts_names_that_start_with_the_query_first(
    client: TestClient, db_session: Session
) -> None:
    db_session.add_all(
        [
            Skill(name="Advanced Data Analysis", name_normalized="advanced data analysis"),
            Skill(name="Data entry", name_normalized="data entry"),
            Skill(name="Big data", name_normalized="big data"),
            Skill(name="Data analysis", name_normalized="data analysis"),
        ]
    )
    db_session.flush()

    assert names(client.get(f"{BASE}/skills", params={"q": "data"})) == [
        "Data analysis",
        "Data entry",
        "Advanced Data Analysis",
        "Big data",
    ]


def test_skill_search_ignores_extra_spaces_around_the_query(
    client: TestClient, seeded: Session
) -> None:
    assert "Customer service" in names(
        client.get(f"{BASE}/skills", params={"q": "  customer   SERVICE "})
    )


def test_skill_search_returns_at_most_20(client: TestClient, seeded: Session) -> None:
    result = client.get(f"{BASE}/skills", params={"q": "a"}).json()["data"]
    everything = client.get(f"{BASE}/skills").json()["data"]

    assert len(result) == 20
    assert len(everything) == 20  # no query: the first 20 alphabetically, not the whole table


def test_skill_search_with_no_query_is_alphabetical(client: TestClient, seeded: Session) -> None:
    listed = names(client.get(f"{BASE}/skills"))

    assert listed == sorted(listed, key=str.lower)
    assert listed[0].lower().startswith("a")


@pytest.mark.parametrize("wildcard", ["%", "_", "%%", "a%", "\\", "_ython"])
def test_wildcards_are_matched_literally(
    client: TestClient, seeded: Session, wildcard: str
) -> None:
    response = client.get(f"{BASE}/skills", params={"q": wildcard})

    assert response.status_code == 200
    assert names(response) == []  # no skill contains these characters


def test_a_percent_sign_in_a_skill_name_is_found_by_searching_for_it(
    client: TestClient, db_session: Session
) -> None:
    db_session.add(Skill(name="100% commitment", name_normalized="100% commitment"))
    db_session.flush()

    assert names(client.get(f"{BASE}/skills", params={"q": "100%"})) == ["100% commitment"]


def test_inactive_skills_are_not_suggested(client: TestClient, seeded: Session) -> None:
    seeded.execute(update(Skill).where(Skill.name_normalized == "luo").values(is_active=False))

    assert "Luo" not in names(client.get(f"{BASE}/skills", params={"q": "luo"}))


def test_a_blank_query_behaves_like_no_query(client: TestClient, seeded: Session) -> None:
    assert names(client.get(f"{BASE}/skills", params={"q": "   "})) == names(
        client.get(f"{BASE}/skills")
    )


def test_a_too_long_query_is_a_validation_error_in_the_error_format(
    client: TestClient, seeded: Session
) -> None:
    response = client.get(f"{BASE}/skills", params={"q": "x" * 51})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert "q" in response.json()["error"]["details"]["fields"]


# ---------- caching ----------


@pytest.mark.parametrize(
    "path", ["districts", "qualification-levels", "institutions", "fields-of-study", "skills"]
)
def test_lists_are_cacheable_and_have_an_etag(
    client: TestClient, seeded: Session, path: str
) -> None:
    response = client.get(f"{BASE}/{path}")

    assert response.headers["cache-control"] == "public, max-age=3600"
    assert response.headers["etag"].startswith('"') and response.headers["etag"].endswith('"')
    assert response.headers["content-type"] == "application/json"


def test_a_repeat_request_with_the_etag_gets_an_empty_304(
    client: TestClient, seeded: Session
) -> None:
    first = client.get(f"{BASE}/districts")

    repeat = client.get(f"{BASE}/districts", headers={"If-None-Match": first.headers["etag"]})

    assert repeat.status_code == 304
    assert repeat.content == b""
    assert repeat.headers["etag"] == first.headers["etag"]
    assert repeat.headers["cache-control"] == "public, max-age=3600"


def test_etag_variants_are_understood(client: TestClient, seeded: Session) -> None:
    etag = client.get(f"{BASE}/districts").headers["etag"]

    for header in (f"W/{etag}", f'"other", {etag}', "*"):
        response = client.get(f"{BASE}/districts", headers={"If-None-Match": header})
        assert response.status_code == 304, header
    assert client.get(f"{BASE}/districts", headers={"If-None-Match": '"stale"'}).status_code == 200


def test_the_etag_changes_when_the_list_changes(client: TestClient, db_session: Session) -> None:
    db_session.add(District(name="Alpha", region="Central"))
    db_session.flush()
    before = client.get(f"{BASE}/districts").headers["etag"]

    db_session.add(District(name="Bravo", region="Central"))
    db_session.flush()
    after = client.get(f"{BASE}/districts")

    assert after.headers["etag"] != before
    assert client.get(f"{BASE}/districts", headers={"If-None-Match": before}).status_code == 200


def test_different_skill_searches_have_different_etags(client: TestClient, seeded: Session) -> None:
    excel = client.get(f"{BASE}/skills", params={"q": "excel"}).headers["etag"]
    python = client.get(f"{BASE}/skills", params={"q": "python"}).headers["etag"]

    assert excel != python


def test_an_empty_database_gives_empty_lists_not_errors(client: TestClient) -> None:
    for path in ("districts", "qualification-levels", "institutions", "fields-of-study", "skills"):
        assert client.get(f"{BASE}/{path}").json() == {"data": []}, path

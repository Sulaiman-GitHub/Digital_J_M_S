"""Employer vacancy API: drafts, publishing, edits, closing, ownership."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import AuditEvent, UserRole, Vacancy, VacancyRequirement, VerificationStatus
from tests.api.auth_helpers import csrf_headers, error_code
from tests.api.profile_helpers import create_user, login_as
from tests.api.vacancy_helpers import (
    EMPLOYER_VACANCIES,
    World,
    action,
    create,
    fields_of,
    in_days,
    make_company,
    make_world,
    payload,
    put,
)

S = VerificationStatus


@pytest.fixture
def world(db_session: Session) -> World:
    return make_world(db_session)


@pytest.fixture
def boss(client: TestClient, db_session: Session, world: World) -> TestClient:
    """An approved employer, logged in."""
    make_company(db_session, world)
    login_as(client, "boss@example.com")
    return client


@pytest.fixture
def rival(client: TestClient) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        yield other


def draft_id(client: TestClient, world: World, **overrides: Any) -> str:
    response = create(client, payload(world, **overrides))
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def published_id(client: TestClient, world: World, **overrides: Any) -> str:
    vacancy_id = draft_id(client, world, **overrides)
    response = action(client, vacancy_id, "publish")
    assert response.status_code == 200, response.text
    return vacancy_id


# ---------- drafts ----------


def test_creating_a_draft(boss: TestClient, world: World) -> None:
    response = create(boss, payload(world))

    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["status"] == "draft"
    assert data["is_live"] is False
    assert data["published_at"] is None
    assert data["created_by_admin"] is False
    assert data["title"] == "Accounts Assistant"
    assert data["salary_min"] == 800_000 and data["show_salary"] is True
    assert data["district_id"] == str(world.district.id)


def test_a_draft_may_be_nearly_empty(boss: TestClient) -> None:
    response = create(boss, {"title": "Driver"})

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["status"] == "draft"
    assert data["description"] is None and data["expires_at"] is None
    assert data["application_method"] == "internal"
    assert data["min_experience_years"] == 0 and data["requirements"] == []


def test_an_unapproved_employer_can_still_save_drafts(
    client: TestClient, db_session: Session, world: World
) -> None:
    make_company(db_session, world, status=S.PENDING)
    login_as(client, "boss@example.com")

    assert create(client, payload(world)).status_code == 201


def test_an_employer_without_a_company_cannot_create_one(
    client: TestClient, db_session: Session, world: World
) -> None:
    create_user(db_session, "boss@example.com", UserRole.EMPLOYER)
    login_as(client, "boss@example.com")

    response = create(client, payload(world))

    assert response.status_code == 404
    assert error_code(response) == "employer_not_found"


def test_values_are_cleaned(boss: TestClient, world: World) -> None:
    response = create(
        boss,
        payload(
            world,
            title="  Accounts   Assistant\t",
            description="  Line one\r\nLine two  ",
        ),
    )

    data = response.json()["data"]
    assert data["title"] == "Accounts Assistant"
    assert data["description"] == "Line one\nLine two"


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"title": ""}, "title"),
        ({"title": "  "}, "title"),
        ({"title": "ab"}, "title"),
        ({"title": "x" * 201}, "title"),
        ({"description": "x" * 10_001}, "description"),
        ({"employment_type": "gig"}, "employment_type"),
        ({"work_arrangement": "orbital"}, "work_arrangement"),
        ({"min_experience_years": -1}, "min_experience_years"),
        ({"min_experience_years": 51}, "min_experience_years"),
        ({"salary_min": -5}, "salary_min"),
        ({"salary_max": 10**11}, "salary_max"),
        ({"salary_min": 2_000_000, "salary_max": 1_000_000}, "salary_max"),
        ({"application_method": "carrier_pigeon"}, "application_method"),
        (
            {"application_method": "internal", "external_url": "https://x.example.com"},
            "external_url",
        ),
        (
            {"application_method": "external", "external_url": "http://x.example.com"},
            "external_url",
        ),
        ({"application_method": "external", "external_url": "javascript:alert(1)"}, "external_url"),
        (
            {"application_method": "external", "external_url": "https://has space.com"},
            "external_url",
        ),
        ({"expires_at": "2026-12-01"}, "expires_at"),
        ({"expires_at": "2026-12-01T10:00:00"}, "expires_at"),
        ({"district_id": "3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10"}, "district_id"),
        (
            {"min_qualification_level_id": "3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10"},
            "min_qualification_level_id",
        ),
    ],
)
def test_invalid_values_are_422_with_the_field_named(
    boss: TestClient, world: World, overrides: dict[str, Any], field: str
) -> None:
    response = create(boss, payload(world, **overrides))

    assert response.status_code == 422, (overrides, response.text)
    assert error_code(response) == "validation_error"
    assert field in fields_of(response)


def test_the_status_and_owner_cannot_be_chosen(boss: TestClient, world: World) -> None:
    response = create(
        boss,
        payload(
            world,
            status="published",
            employer_id="3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10",
            published_at="2026-01-01T00:00:00Z",
            created_by_admin=True,
        ),
    )

    assert response.status_code == 422
    assert {"status", "employer_id", "published_at", "created_by_admin"} <= set(fields_of(response))


def test_an_external_vacancy_needs_a_valid_https_link_only_to_publish(
    boss: TestClient, world: World
) -> None:
    vacancy_id = draft_id(boss, world, application_method="external", external_url=None)

    response = action(boss, vacancy_id, "publish")

    assert response.status_code == 422
    assert "external_url" in fields_of(response)
    ok = put(
        boss,
        vacancy_id,
        payload(world, application_method="external", external_url="https://jobs.example.com/12"),
    )
    assert ok.status_code == 200
    assert action(boss, vacancy_id, "publish").status_code == 200


# ---------- requirements ----------


def test_requirements_keep_their_mandatory_flag(boss: TestClient, world: World) -> None:
    response = create(
        boss,
        payload(
            world,
            requirements=[
                {"kind": "skill", "skill_id": str(world.python.id), "is_mandatory": True},
                {"kind": "skill", "skill_id": str(world.excel.id), "is_mandatory": False},
                {"kind": "qualification", "label": "Diploma in accounting", "is_mandatory": True},
                {"kind": "certification", "label": "ACCA", "is_mandatory": False},
                {"kind": "other", "label": "Own motorbike", "is_mandatory": False},
            ],
        ),
    )

    items = response.json()["data"]["requirements"]
    flags = {(item["kind"], item["label"]): item["is_mandatory"] for item in items}
    assert flags == {
        ("skill", "Python"): True,
        ("skill", "Microsoft Excel"): False,
        ("qualification", "Diploma in accounting"): True,
        ("certification", "ACCA"): False,
        ("other", "Own motorbike"): False,
    }
    # Mandatory ones come first.
    assert [item["is_mandatory"] for item in items] == [True, True, False, False, False]


def test_a_skill_requirement_takes_its_label_from_the_skill(boss: TestClient, world: World) -> None:
    response = create(
        boss,
        payload(
            world,
            requirements=[
                {"kind": "skill", "skill_id": str(world.python.id), "label": "Snake language"}
            ],
        ),
    )

    assert response.json()["data"]["requirements"][0]["label"] == "Python"


def test_a_save_replaces_the_requirements(
    boss: TestClient, world: World, db_session: Session
) -> None:
    vacancy_id = draft_id(boss, world)

    response = put(
        boss,
        vacancy_id,
        payload(world, requirements=[{"kind": "other", "label": "Driving licence"}]),
    )

    assert [item["label"] for item in response.json()["data"]["requirements"]] == [
        "Driving licence"
    ]
    assert db_session.scalar(select(func.count()).select_from(VacancyRequirement)) == 1


def test_at_most_twenty_requirements(boss: TestClient, world: World) -> None:
    twenty = [{"kind": "other", "label": f"Requirement {i}"} for i in range(20)]

    assert create(boss, payload(world, requirements=twenty)).status_code == 201

    response = create(
        boss, payload(world, requirements=[*twenty, {"kind": "other", "label": "x1"}])
    )
    assert response.status_code == 422
    assert "requirements" in fields_of(response)


@pytest.mark.parametrize(
    ("requirement", "key"),
    [
        ({"kind": "skill"}, "requirements.0.skill_id"),
        (
            {"kind": "skill", "skill_id": "3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10"},
            "requirements.0.skill_id",
        ),
        ({"kind": "certification"}, "requirements.0.label"),
        ({"kind": "other", "label": "  "}, "requirements.0.label"),
        (
            {
                "kind": "qualification",
                "label": "x",
                "skill_id": "3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10",
            },
            "requirements.0.skill_id",
        ),
    ],
)
def test_bad_requirements_are_named_by_position(
    boss: TestClient, world: World, requirement: dict[str, Any], key: str
) -> None:
    response = create(boss, payload(world, requirements=[requirement]))

    assert response.status_code == 422
    assert key in fields_of(response)


def test_the_same_skill_cannot_be_listed_twice(boss: TestClient, world: World) -> None:
    skill = {"kind": "skill", "skill_id": str(world.python.id)}

    response = create(boss, payload(world, requirements=[skill, skill]))

    assert response.status_code == 422
    assert "requirements.1.skill_id" in fields_of(response)


def test_a_rejected_save_stores_nothing(
    boss: TestClient, world: World, db_session: Session
) -> None:
    create(boss, payload(world, requirements=[{"kind": "skill"}]))

    assert db_session.scalar(select(func.count()).select_from(Vacancy)) == 0
    assert db_session.scalar(select(func.count()).select_from(VacancyRequirement)) == 0


# ---------- publishing ----------


def test_an_approved_employer_can_publish(
    boss: TestClient, world: World, db_session: Session
) -> None:
    vacancy_id = draft_id(boss, world)

    response = action(boss, vacancy_id, "publish")

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "published" and data["is_live"] is True
    assert data["published_at"] is not None
    actions = db_session.scalars(
        select(AuditEvent.action).where(AuditEvent.action == "vacancy_published")
    )
    assert list(actions) == ["vacancy_published"]


@pytest.mark.parametrize("status", [S.DRAFT, S.PENDING, S.REJECTED, S.SUSPENDED])
def test_an_employer_who_is_not_approved_cannot_publish(
    client: TestClient, db_session: Session, world: World, status: S
) -> None:
    make_company(db_session, world, status=status)
    login_as(client, "boss@example.com")
    vacancy_id = draft_id(client, world)

    response = action(client, vacancy_id, "publish")

    assert response.status_code == 403
    assert error_code(response) == "employer_not_verified"
    assert db_session.scalars(select(Vacancy.status)).one() == "draft"


def test_losing_approval_stops_publishing_at_once(
    boss: TestClient, world: World, db_session: Session
) -> None:
    from tests.api.vacancy_helpers import employer_row

    vacancy_id = draft_id(boss, world)
    employer_row(db_session).verification_status = S.SUSPENDED
    db_session.commit()

    assert action(boss, vacancy_id, "publish").status_code == 403


@pytest.mark.parametrize(
    ("missing", "field"),
    [
        ({"description": None}, "description"),
        ({"employment_type": None}, "employment_type"),
        ({"work_arrangement": None}, "work_arrangement"),
        ({"district_id": None}, "district_id"),
        ({"expires_at": None}, "expires_at"),
    ],
)
def test_publishing_needs_the_required_fields(
    boss: TestClient, world: World, missing: dict[str, None], field: str
) -> None:
    vacancy_id = draft_id(boss, world, **missing)

    response = action(boss, vacancy_id, "publish")

    assert response.status_code == 422
    assert error_code(response) == "vacancy_incomplete"
    assert set(fields_of(response)) == {field}


def test_every_missing_field_is_reported_together(boss: TestClient) -> None:
    vacancy_id = draft_id_minimal(boss)

    response = action(boss, vacancy_id, "publish")

    assert set(fields_of(response)) == {
        "description",
        "employment_type",
        "work_arrangement",
        "district_id",
        "expires_at",
    }


def draft_id_minimal(client: TestClient) -> str:
    return create(client, {"title": "Driver"}).json()["data"]["id"]


def test_a_remote_vacancy_needs_no_district(boss: TestClient, world: World) -> None:
    vacancy_id = draft_id(boss, world, work_arrangement="remote", district_id=None)

    assert action(boss, vacancy_id, "publish").status_code == 200


@pytest.mark.parametrize("arrangement", ["onsite", "hybrid"])
def test_other_arrangements_need_a_district(
    boss: TestClient, world: World, arrangement: str
) -> None:
    vacancy_id = draft_id(boss, world, work_arrangement=arrangement, district_id=None)

    response = action(boss, vacancy_id, "publish")

    assert response.status_code == 422
    assert "district_id" in fields_of(response)


@pytest.mark.parametrize(
    ("expiry", "ok"),
    [
        (in_days(-1), False),
        (in_days(1), True),
        (in_days(89), True),
        (in_days(91), False),
        (in_days(365), False),
    ],
)
def test_the_expiry_must_be_in_the_future_and_within_ninety_days(
    boss: TestClient, world: World, expiry: str, ok: bool
) -> None:
    vacancy_id = draft_id(boss, world, expires_at=expiry)

    response = action(boss, vacancy_id, "publish")

    assert (response.status_code == 200) is ok, response.text
    if not ok:
        assert "expires_at" in fields_of(response)


def test_publishing_twice_is_refused(boss: TestClient, world: World) -> None:
    vacancy_id = published_id(boss, world)

    response = action(boss, vacancy_id, "publish")

    assert response.status_code == 409
    assert error_code(response) == "invalid_vacancy_transition"


# ---------- editing ----------


def test_a_draft_can_be_edited_freely(boss: TestClient, world: World) -> None:
    vacancy_id = draft_id(boss, world)

    response = put(
        boss,
        vacancy_id,
        payload(
            world,
            title="Senior Accountant",
            employment_type="contract",
            work_arrangement="hybrid",
            district_id=str(world.other_district.id),
            application_method="external",
            external_url="https://jobs.example.com/1",
        ),
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["title"] == "Senior Accountant" and data["employment_type"] == "contract"
    assert data["district_id"] == str(world.other_district.id)


def test_a_published_vacancy_can_change_its_description_requirements_and_pay(
    boss: TestClient, world: World
) -> None:
    vacancy_id = published_id(boss, world)

    response = put(
        boss,
        vacancy_id,
        payload(
            world,
            description="A better description.",
            requirements=[{"kind": "other", "label": "Driving licence", "is_mandatory": True}],
            salary_min=900_000,
            salary_max=1_500_000,
            min_experience_years=2,
        ),
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["description"] == "A better description."
    assert data["status"] == "published" and data["is_live"] is True
    assert [item["label"] for item in data["requirements"]] == ["Driving licence"]
    assert data["salary_max"] == 1_500_000


@pytest.mark.parametrize(
    "change",
    [
        {"title": "A different job"},
        {"employment_type": "contract"},
        {"work_arrangement": "remote"},
        {"application_method": "external", "external_url": "https://x.example.com"},
    ],
)
def test_a_published_vacancy_keeps_its_identity(
    boss: TestClient, world: World, change: dict[str, Any]
) -> None:
    vacancy_id = published_id(boss, world)

    response = put(boss, vacancy_id, payload(world, **change))

    assert response.status_code == 422
    assert error_code(response) == "field_locked"
    assert set(change) & set(fields_of(response))


def test_a_published_vacancys_district_is_locked(boss: TestClient, world: World) -> None:
    vacancy_id = published_id(boss, world)

    response = put(boss, vacancy_id, payload(world, district_id=str(world.other_district.id)))

    assert response.status_code == 422
    assert "district_id" in fields_of(response)


def test_the_expiry_can_be_extended_up_to_ninety_days_from_publishing(
    boss: TestClient, world: World, db_session: Session
) -> None:
    vacancy_id = published_id(boss, world, expires_at=in_days(10))
    published_at = db_session.scalars(select(Vacancy.published_at)).one()
    latest = published_at + timedelta(days=90)

    ok = put(
        boss, vacancy_id, payload(world, expires_at=(latest - timedelta(minutes=1)).isoformat())
    )
    too_far = put(
        boss, vacancy_id, payload(world, expires_at=(latest + timedelta(minutes=1)).isoformat())
    )

    assert ok.status_code == 200, ok.text
    assert too_far.status_code == 422
    assert "expires_at" in fields_of(too_far)


def test_a_published_vacancy_cannot_lose_its_required_fields_or_expire_in_the_past(
    boss: TestClient, world: World
) -> None:
    vacancy_id = published_id(boss, world)

    no_description = put(boss, vacancy_id, payload(world, description=None))
    past = put(boss, vacancy_id, payload(world, expires_at=in_days(-1)))
    none = put(boss, vacancy_id, payload(world, expires_at=None))

    for response in (no_description, past, none):
        assert response.status_code == 422
    assert "description" in fields_of(no_description)
    assert "expires_at" in fields_of(past) and "expires_at" in fields_of(none)


def test_a_rejected_edit_changes_nothing(boss: TestClient, world: World) -> None:
    vacancy_id = published_id(boss, world)

    put(boss, vacancy_id, payload(world, title="Changed", description="Changed too"))

    data = boss.get(f"{EMPLOYER_VACANCIES}/{vacancy_id}").json()["data"]
    assert data["title"] == "Accounts Assistant"
    assert data["description"] == "Prepare invoices and reconcile accounts."


# ---------- closing ----------


def test_closing_a_published_vacancy(boss: TestClient, world: World, db_session: Session) -> None:
    vacancy_id = published_id(boss, world)

    response = action(boss, vacancy_id, "close")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "closed" and data["is_live"] is False
    actions = db_session.scalars(
        select(AuditEvent.action).where(AuditEvent.action == "vacancy_closed")
    )
    assert list(actions) == ["vacancy_closed"]


def test_a_draft_can_be_closed_to_discard_it(boss: TestClient, world: World) -> None:
    vacancy_id = draft_id(boss, world)

    assert action(boss, vacancy_id, "close").json()["data"]["status"] == "closed"


def test_closed_is_final(boss: TestClient, world: World) -> None:
    vacancy_id = published_id(boss, world)
    action(boss, vacancy_id, "close")

    for response in (
        action(boss, vacancy_id, "close"),
        action(boss, vacancy_id, "publish"),
        put(boss, vacancy_id, payload(world, description="Reopen me")),
    ):
        assert response.status_code == 409
        assert error_code(response) == "vacancy_closed"


def test_an_unapproved_employer_can_still_close_their_vacancy(
    client: TestClient, db_session: Session, world: World
) -> None:
    from tests.api.vacancy_helpers import employer_row

    make_company(db_session, world)
    login_as(client, "boss@example.com")
    vacancy_id = published_id(client, world)
    employer_row(db_session).verification_status = S.SUSPENDED
    db_session.commit()

    assert action(client, vacancy_id, "close").status_code == 200


# ---------- expiry is computed, never stored ----------


def test_an_expired_vacancy_is_not_live_though_still_published(
    boss: TestClient, world: World, db_session: Session
) -> None:
    vacancy_id = published_id(boss, world)
    db_session.execute(
        text("update vacancies set expires_at = now() - interval '1 minute' where id = :i"),
        {"i": vacancy_id},
    )
    db_session.commit()

    data = boss.get(f"{EMPLOYER_VACANCIES}/{vacancy_id}").json()["data"]

    assert data["status"] == "published"
    assert data["is_live"] is False


def test_an_expired_vacancy_can_be_extended_again(
    boss: TestClient, world: World, db_session: Session
) -> None:
    vacancy_id = published_id(boss, world)
    db_session.execute(
        text("update vacancies set expires_at = now() - interval '1 minute' where id = :i"),
        {"i": vacancy_id},
    )
    db_session.commit()

    response = put(boss, vacancy_id, payload(world, expires_at=in_days(20)))

    assert response.status_code == 200, response.text
    assert response.json()["data"]["is_live"] is True


def test_the_live_predicate_matches_only_published_and_unexpired(
    boss: TestClient, world: World, db_session: Session
) -> None:
    from app.services.vacancies import live_clause

    live = published_id(boss, world, title="Live job")
    expired = published_id(boss, world, title="Expired job")
    draft_id(boss, world, title="Draft job")
    closed = published_id(boss, world, title="Closed job")
    action(boss, closed, "close")
    db_session.execute(
        text("update vacancies set expires_at = now() - interval '1 minute' where id = :i"),
        {"i": expired},
    )
    db_session.commit()

    titles = set(db_session.scalars(select(Vacancy.title).where(live_clause())))

    assert titles == {"Live job"}
    assert str(db_session.scalars(select(Vacancy.id).where(live_clause())).one()) == live


# ---------- listing ----------


def test_the_list_shows_own_vacancies_of_any_status_newest_change_first(
    boss: TestClient, world: World, db_session: Session
) -> None:
    first = draft_id(boss, world, title="First job")
    second = published_id(boss, world, title="Second job")
    third = draft_id(boss, world, title="Third job")
    action(boss, second, "close")
    # Each request is its own transaction in production; here they share one, so set the order.
    for vacancy_id, minutes in ((second, 1), (first, 5), (third, 10)):
        db_session.execute(
            text(
                "update vacancies set updated_at = now() - make_interval(mins => :m) where id = :i"
            ),
            {"m": minutes, "i": vacancy_id},
        )
    db_session.commit()

    response = boss.get(EMPLOYER_VACANCIES)

    assert response.status_code == 200
    titles = [item["title"] for item in response.json()["data"]]
    assert titles == ["Second job", "First job", "Third job"]
    assert response.json()["meta"] == {"page": 1, "page_size": 20, "total": 3}
    assert {item["status"] for item in response.json()["data"]} == {"draft", "closed"}


@pytest.mark.parametrize(("status", "expected"), [("draft", 2), ("published", 1), ("closed", 1)])
def test_filtering_the_list_by_status(
    boss: TestClient, world: World, status: str, expected: int
) -> None:
    draft_id(boss, world, title="Draft one")
    draft_id(boss, world, title="Draft two")
    published_id(boss, world, title="Live one")
    action(boss, published_id(boss, world, title="Closed one"), "close")

    response = boss.get(EMPLOYER_VACANCIES, params={"status": status})

    assert len(response.json()["data"]) == expected
    assert response.json()["meta"]["total"] == expected


def test_paging_the_list(boss: TestClient, world: World) -> None:
    for number in range(5):
        draft_id(boss, world, title=f"Job number {number}")

    first = boss.get(EMPLOYER_VACANCIES, params={"page": 1, "page_size": 2})
    last = boss.get(EMPLOYER_VACANCIES, params={"page": 3, "page_size": 2})
    beyond = boss.get(EMPLOYER_VACANCIES, params={"page": 4, "page_size": 2})

    assert len(first.json()["data"]) == 2 and first.json()["meta"]["total"] == 5
    assert len(last.json()["data"]) == 1
    assert beyond.json()["data"] == []


@pytest.mark.parametrize(
    "params", [{"page": 0}, {"page_size": 0}, {"page_size": 51}, {"status": "archived"}]
)
def test_bad_list_parameters_are_422(boss: TestClient, params: dict[str, Any]) -> None:
    assert boss.get(EMPLOYER_VACANCIES, params=params).status_code == 422


def test_an_employer_with_no_company_gets_404_for_the_list(
    client: TestClient, db_session: Session
) -> None:
    create_user(db_session, "boss@example.com", UserRole.EMPLOYER)
    login_as(client, "boss@example.com")

    response = client.get(EMPLOYER_VACANCIES)

    assert response.status_code == 404
    assert error_code(response) == "employer_not_found"


# ---------- ownership ----------


def test_another_employer_gets_404_for_every_operation(
    boss: TestClient, rival: TestClient, db_session: Session, world: World
) -> None:
    vacancy_id = published_id(boss, world)
    make_company(db_session, world, "rival@example.com", name="Rival Ltd")
    login_as(rival, "rival@example.com")

    responses = [
        rival.get(f"{EMPLOYER_VACANCIES}/{vacancy_id}"),
        put(rival, vacancy_id, payload(world, description="Hijacked")),
        action(rival, vacancy_id, "publish"),
        action(rival, vacancy_id, "close"),
    ]

    for response in responses:
        assert response.status_code == 404
        assert error_code(response) == "vacancy_not_found"
    data = boss.get(f"{EMPLOYER_VACANCIES}/{vacancy_id}").json()["data"]
    assert data["description"] != "Hijacked" and data["status"] == "published"
    assert rival.get(EMPLOYER_VACANCIES).json()["data"] == []


def test_an_unknown_or_malformed_id(boss: TestClient) -> None:
    assert boss.get(f"{EMPLOYER_VACANCIES}/3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10").status_code == 404
    assert boss.get(f"{EMPLOYER_VACANCIES}/not-a-uuid").status_code == 422


# ---------- permissions ----------


def test_anonymous_requests_are_401(client: TestClient, world: World) -> None:
    any_id = "3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10"
    responses = [
        client.get(EMPLOYER_VACANCIES),
        client.get(f"{EMPLOYER_VACANCIES}/{any_id}"),
        client.post(EMPLOYER_VACANCIES, json=payload(world)),
        client.put(f"{EMPLOYER_VACANCIES}/{any_id}", json=payload(world)),
        client.post(f"{EMPLOYER_VACANCIES}/{any_id}/publish"),
        client.post(f"{EMPLOYER_VACANCIES}/{any_id}/close"),
    ]

    for response in responses:
        assert response.status_code == 401
        assert error_code(response) == "not_authenticated"


@pytest.mark.parametrize("role", [UserRole.JOB_SEEKER, UserRole.ADMIN])
def test_other_roles_are_403(
    client: TestClient, db_session: Session, world: World, role: UserRole
) -> None:
    create_user(db_session, "other@example.com", role)
    login_as(client, "other@example.com")
    any_id = "3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10"

    responses = [
        client.get(EMPLOYER_VACANCIES),
        client.get(f"{EMPLOYER_VACANCIES}/{any_id}"),
        create(client, payload(world)),
        put(client, any_id, payload(world)),
        action(client, any_id, "publish"),
        action(client, any_id, "close"),
    ]

    for response in responses:
        assert response.status_code == 403
        assert error_code(response) == "forbidden"


def test_writes_need_the_csrf_header(boss: TestClient, world: World) -> None:
    vacancy_id = draft_id(boss, world)
    any_id = vacancy_id

    responses = [
        boss.post(EMPLOYER_VACANCIES, json=payload(world)),
        boss.put(f"{EMPLOYER_VACANCIES}/{any_id}", json=payload(world)),
        boss.post(f"{EMPLOYER_VACANCIES}/{any_id}/publish"),
        boss.post(f"{EMPLOYER_VACANCIES}/{any_id}/close"),
    ]

    for response in responses:
        assert response.status_code == 403
    assert boss.get(f"{EMPLOYER_VACANCIES}/{any_id}").json()["data"]["status"] == "draft"


def test_the_openapi_lists_the_vacancy_operations(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert {
        p: sorted(m)
        for p, m in paths.items()
        if (p.startswith("/api/v1/employer/vacancies") or p.startswith("/api/v1/admin/vacancies"))
        and "/applications" not in p
    } == {
        "/api/v1/employer/vacancies": ["get", "post"],
        "/api/v1/employer/vacancies/{vacancy_id}": ["get", "put"],
        "/api/v1/employer/vacancies/{vacancy_id}/publish": ["post"],
        "/api/v1/employer/vacancies/{vacancy_id}/close": ["post"],
        "/api/v1/admin/vacancies": ["post"],
    }


def test_csrf_headers_helper_is_used(boss: TestClient) -> None:
    assert csrf_headers(boss)["X-CSRF-Token"]
    assert datetime.now(UTC)

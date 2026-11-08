"""Reporting a vacancy: who can, how often, and what is stored."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    AuditEvent,
    Employer,
    ReportReason,
    ReportStatus,
    UserRole,
    Vacancy,
    VacancyReport,
    VacancyStatus,
)
from tests.api.auth_helpers import csrf_headers, error_code, get_user, register_and_login
from tests.api.profile_helpers import create_user, login_as
from tests.api.vacancy_helpers import World, add_vacancy, fields_of, make_company, make_world


@pytest.fixture
def world(db_session: Session) -> World:
    return make_world(db_session)


@pytest.fixture
def company(db_session: Session, world: World) -> Employer:
    return make_company(db_session, world)


@pytest.fixture
def vacancy(db_session: Session, company: Employer, world: World) -> Vacancy:
    return add_vacancy(db_session, company, world)


@pytest.fixture
def reader(client: TestClient) -> TestClient:
    register_and_login(client, "nakato@example.com")  # an ordinary job seeker, email not verified
    return client


@pytest.fixture
def second(client: TestClient) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        yield other


def report_url(vacancy: Vacancy | Any) -> str:
    return f"/api/v1/vacancies/{getattr(vacancy, 'id', vacancy)}/reports"


def report(client: TestClient, vacancy: Vacancy | Any, **body: Any):
    return client.post(
        report_url(vacancy),
        json={"reason": "scam_or_fee", **body},
        headers=csrf_headers(client),
    )


def count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(VacancyReport)) or 0


def test_a_logged_in_user_can_report_a_live_vacancy(
    reader: TestClient, vacancy: Vacancy, db_session: Session
) -> None:
    response = report(reader, vacancy, details="  They asked me for a registration fee.  ")

    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert set(data) == {"id", "status", "created_at"}
    assert data["status"] == "open"
    stored = db_session.scalars(select(VacancyReport)).one()
    assert stored.reason == ReportReason.SCAM_OR_FEE
    assert stored.details == "They asked me for a registration fee."
    assert stored.reporter_user_id == get_user(db_session, "nakato@example.com").id
    assert stored.vacancy_id == vacancy.id and stored.status == ReportStatus.OPEN


def test_details_are_optional_except_for_other(reader: TestClient, vacancy: Vacancy) -> None:
    assert report(reader, vacancy, reason="misleading").status_code == 201


def test_other_needs_details(reader: TestClient, vacancy: Vacancy, db_session: Session) -> None:
    for details in (None, "", "   "):
        response = report(
            reader, vacancy, reason="other", **({"details": details} if details is not None else {})
        )
        assert response.status_code == 422, details
        assert "details" in fields_of(response)

    assert report(reader, vacancy, reason="other", details="Wrong salary.").status_code == 201
    assert count(db_session) == 1


@pytest.mark.parametrize("reason", ["scam_or_fee", "fake_employer", "misleading", "discriminatory"])
def test_every_reason_is_accepted(reader: TestClient, vacancy: Vacancy, reason: str) -> None:
    assert report(reader, vacancy, reason=reason).status_code == 201


@pytest.mark.parametrize(
    "body",
    [
        {"reason": "spam"},
        {"reason": ""},
        {},
        {"reason": "scam_or_fee", "details": "x" * 2001},
        {"reason": "scam_or_fee", "status": "actioned"},
        {"reason": "scam_or_fee", "reporter_user_id": "x"},
    ],
)
def test_invalid_bodies_are_422(
    reader: TestClient, vacancy: Vacancy, db_session: Session, body: dict[str, Any]
) -> None:
    response = reader.post(report_url(vacancy), json=body, headers=csrf_headers(reader))

    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert count(db_session) == 0


def test_the_longest_details_are_fine(reader: TestClient, vacancy: Vacancy) -> None:
    assert report(reader, vacancy, details="x" * 2000).status_code == 201


# ---------- one open report per person ----------


def test_the_same_person_cannot_report_twice(
    reader: TestClient, vacancy: Vacancy, db_session: Session
) -> None:
    assert report(reader, vacancy).status_code == 201

    again = report(reader, vacancy, reason="fake_employer")

    assert again.status_code == 409
    assert error_code(again) == "already_reported"
    assert count(db_session) == 1


def test_different_people_can_each_report(
    reader: TestClient, second: TestClient, vacancy: Vacancy, db_session: Session
) -> None:
    register_and_login(second, "okello@example.com")

    assert report(reader, vacancy).status_code == 201
    assert report(second, vacancy).status_code == 201
    assert count(db_session) == 2


def test_a_person_can_report_after_their_report_was_handled(
    reader: TestClient, vacancy: Vacancy, db_session: Session
) -> None:
    report(reader, vacancy)
    stored = db_session.scalars(select(VacancyReport)).one()
    stored.status = ReportStatus.DISMISSED
    db_session.commit()

    assert report(reader, vacancy).status_code == 201
    assert count(db_session) == 2


def test_one_person_can_report_different_vacancies(
    reader: TestClient, vacancy: Vacancy, company: Employer, world: World, db_session: Session
) -> None:
    other = add_vacancy(db_session, company, world, title="Driver")

    assert report(reader, vacancy).status_code == 201
    assert report(reader, other).status_code == 201


# ---------- who and what ----------


def test_anonymous_requests_are_401(
    client: TestClient, vacancy: Vacancy, db_session: Session
) -> None:
    response = client.post(report_url(vacancy), json={"reason": "scam_or_fee"})

    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"
    assert count(db_session) == 0


def test_reporting_needs_the_csrf_header(
    reader: TestClient, vacancy: Vacancy, db_session: Session
) -> None:
    response = reader.post(report_url(vacancy), json={"reason": "scam_or_fee"})

    assert response.status_code == 403
    assert count(db_session) == 0


@pytest.mark.parametrize("role", [UserRole.EMPLOYER, UserRole.ADMIN])
def test_other_roles_may_report_too(
    client: TestClient, db_session: Session, vacancy: Vacancy, role: UserRole
) -> None:
    create_user(db_session, "other@example.com", role)
    login_as(client, "other@example.com")

    assert report(client, vacancy).status_code == 201


def test_an_employer_cannot_report_their_own_vacancy(
    client: TestClient, vacancy: Vacancy, db_session: Session
) -> None:
    login_as(client, "boss@example.com")

    response = report(client, vacancy)

    assert response.status_code == 409
    assert error_code(response) == "cannot_report_own_vacancy"
    assert count(db_session) == 0


@pytest.mark.parametrize("state", ["draft", "closed", "expired"])
def test_only_live_vacancies_can_be_reported(
    reader: TestClient,
    company: Employer,
    world: World,
    db_session: Session,
    state: str,
) -> None:
    overrides: dict[str, Any] = {
        "draft": {"status": VacancyStatus.DRAFT},
        "closed": {"status": VacancyStatus.CLOSED},
        "expired": {
            "published_at": datetime.now(UTC) - timedelta(days=50),
            "expires_at": datetime.now(UTC) - timedelta(days=1),
        },
    }[state]
    hidden = add_vacancy(db_session, company, world, **overrides)

    response = report(reader, hidden)

    assert response.status_code == 404
    assert error_code(response) == "vacancy_not_found"
    assert count(db_session) == 0


def test_unknown_and_malformed_ids(reader: TestClient) -> None:
    assert report(reader, uuid4()).status_code == 404
    assert report(reader, "not-a-uuid").status_code == 422


def test_reporting_leaves_the_vacancy_live(reader: TestClient, vacancy: Vacancy) -> None:
    report(reader, vacancy)

    assert reader.get(f"/api/v1/vacancies/{vacancy.id}").status_code == 200


def test_a_report_is_written_to_the_audit_log(
    reader: TestClient, vacancy: Vacancy, db_session: Session
) -> None:
    report(reader, vacancy, reason="discriminatory")

    event = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "vacancy_reported")
    ).one()
    assert event.entity_id == vacancy.id
    assert event.actor_user_id == get_user(db_session, "nakato@example.com").id
    assert event.event_metadata == {"reason": "discriminatory"}


def test_reporting_is_rate_limited(
    reader: TestClient,
    company: Employer,
    world: World,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    limited = get_settings().model_copy(update={"report_rate_limit": "2/hour"})
    monkeypatch.setattr("app.core.rate_limit.get_settings", lambda: limited)
    vacancies = [add_vacancy(db_session, company, world, title=f"Job {n}") for n in range(3)]

    assert report(reader, vacancies[0]).status_code == 201
    assert report(reader, vacancies[1]).status_code == 201
    response = report(reader, vacancies[2])

    assert response.status_code == 429
    assert error_code(response) == "rate_limited"
    assert count(db_session) == 2


def test_the_openapi_lists_the_report_route(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert sorted(paths["/api/v1/vacancies/{vacancy_id}/reports"]) == ["post"]

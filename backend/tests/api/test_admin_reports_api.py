"""Admin handling of vacancy reports."""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import normalise_email
from app.models import (
    AuditEvent,
    Employer,
    EmployerVerificationEvent,
    ReportReason,
    ReportStatus,
    User,
    UserRole,
    Vacancy,
    VacancyReport,
    VacancyStatus,
    VerificationStatus,
)
from app.services.employers import can_publish
from tests.api.auth_helpers import csrf_headers, error_code, get_user
from tests.api.profile_helpers import create_user, login_as
from tests.api.vacancy_helpers import World, add_vacancy, fields_of, make_company, make_world

REPORTS = "/api/v1/admin/reports"
PUBLIC = "/api/v1/vacancies"
S = VerificationStatus


@pytest.fixture
def world(db_session: Session) -> World:
    return make_world(db_session)


@pytest.fixture
def company(db_session: Session, world: World) -> Employer:
    return make_company(db_session, world)


@pytest.fixture
def vacancy(db_session: Session, company: Employer, world: World) -> Vacancy:
    return add_vacancy(db_session, company, world, title="Earn money fast")


@pytest.fixture
def admin(client: TestClient, db_session: Session) -> TestClient:
    create_user(db_session, "admin@example.com", UserRole.ADMIN)
    login_as(client, "admin@example.com")
    return client


def reporter(db: Session, email: str = "nakato@example.com") -> User:
    user = User(email=email, email_normalized=normalise_email(email), role=UserRole.JOB_SEEKER)
    db.add(user)
    db.flush()
    return user


def make_report(
    db: Session,
    vacancy: Vacancy,
    who: User | None = None,
    *,
    reason: ReportReason = ReportReason.SCAM_OR_FEE,
    details: str | None = "They asked for a fee.",
    status: ReportStatus = ReportStatus.OPEN,
    minutes_ago: int = 0,
) -> VacancyReport:
    item = VacancyReport(
        vacancy_id=vacancy.id,
        reporter_user_id=who.id if who else None,
        reason=reason,
        details=details,
        status=status,
    )
    db.add(item)
    db.flush()
    item.created_at = datetime.now(UTC) - timedelta(minutes=minutes_ago)
    db.commit()
    return item


def resolve(client: TestClient, item: VacancyReport, **body: Any):
    return client.post(
        f"{REPORTS}/{item.id}/resolve",
        json={"action": "dismiss", **body},
        headers=csrf_headers(client),
    )


def public_ids(client: TestClient) -> list[str]:
    return [row["id"] for row in client.get(PUBLIC).json()["data"]]


# ---------- permissions ----------


def test_anonymous_requests_are_401(
    client: TestClient, vacancy: Vacancy, db_session: Session
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))

    for response in (
        client.get(REPORTS),
        client.post(f"{REPORTS}/{item.id}/resolve", json={"action": "dismiss"}),
    ):
        assert response.status_code == 401
        assert error_code(response) == "not_authenticated"


@pytest.mark.parametrize("role", [UserRole.JOB_SEEKER, UserRole.EMPLOYER])
def test_only_admins_can_see_or_resolve_reports(
    client: TestClient, db_session: Session, vacancy: Vacancy, role: UserRole
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))
    create_user(db_session, "other@example.com", role)
    login_as(client, "other@example.com")

    for response in (
        client.get(REPORTS),
        resolve(client, item),
        resolve(client, item, action="action"),
    ):
        assert response.status_code == 403
        assert error_code(response) == "forbidden"
    db_session.refresh(item)
    assert item.status == ReportStatus.OPEN
    db_session.refresh(vacancy)
    assert vacancy.status == VacancyStatus.PUBLISHED


def test_resolving_needs_the_csrf_header(
    admin: TestClient, db_session: Session, vacancy: Vacancy
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))

    response = admin.post(f"{REPORTS}/{item.id}/resolve", json={"action": "dismiss"})

    assert response.status_code == 403
    db_session.refresh(item)
    assert item.status == ReportStatus.OPEN


# ---------- the list ----------


def test_the_list_shows_reports_with_the_vacancy_and_company(
    admin: TestClient, db_session: Session, vacancy: Vacancy
) -> None:
    make_report(db_session, vacancy, reporter(db_session), details="They asked for a fee.")

    response = admin.get(REPORTS)

    assert response.status_code == 200
    (item,) = response.json()["data"]
    assert set(item) == {
        "id",
        "reason",
        "details",
        "status",
        "created_at",
        "handled_at",
        "reporter_email",
        "vacancy",
        "open_reports_for_vacancy",
    }
    assert item["reason"] == "scam_or_fee" and item["status"] == "open"
    assert item["details"] == "They asked for a fee."
    assert item["reporter_email"] == "nakato@example.com"
    assert item["open_reports_for_vacancy"] == 1
    assert item["vacancy"] == {
        "id": str(vacancy.id),
        "title": "Earn money fast",
        "description": "Prepare invoices.",
        "status": "published",
        "is_live": True,
        "company_name": "Ssese Foods Ltd",
        "employer_id": str(vacancy.employer_id),
        "employer_status": "approved",
    }
    assert response.json()["meta"] == {"page": 1, "page_size": 20, "total": 1}


def test_a_long_description_is_shortened_in_the_preview(
    admin: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    long_one = add_vacancy(db_session, company, world, description="word " * 1000)
    make_report(db_session, long_one, reporter(db_session))

    description = admin.get(REPORTS).json()["data"][0]["vacancy"]["description"]

    assert len(description) <= 1501 and description.endswith("…")


def test_the_list_is_newest_first_and_counts_open_reports_per_vacancy(
    admin: TestClient, db_session: Session, vacancy: Vacancy
) -> None:
    older = make_report(db_session, vacancy, reporter(db_session, "a@example.com"), minutes_ago=30)
    newer = make_report(
        db_session,
        vacancy,
        reporter(db_session, "b@example.com"),
        reason=ReportReason.OTHER,
        minutes_ago=5,
    )

    data = admin.get(REPORTS).json()["data"]

    assert [row["id"] for row in data] == [str(newer.id), str(older.id)]
    assert {row["open_reports_for_vacancy"] for row in data} == {2}


@pytest.mark.parametrize(
    ("status", "expected"),
    [("open", 1), ("actioned", 1), ("dismissed", 2)],
)
def test_filtering_by_status(
    admin: TestClient, db_session: Session, vacancy: Vacancy, status: str, expected: int
) -> None:
    make_report(db_session, vacancy, reporter(db_session, "a@example.com"))
    make_report(
        db_session, vacancy, reporter(db_session, "b@example.com"), status=ReportStatus.ACTIONED
    )
    make_report(
        db_session, vacancy, reporter(db_session, "c@example.com"), status=ReportStatus.DISMISSED
    )
    make_report(
        db_session, vacancy, reporter(db_session, "d@example.com"), status=ReportStatus.DISMISSED
    )

    response = admin.get(REPORTS, params={"status": status})

    assert len(response.json()["data"]) == expected
    assert response.json()["meta"]["total"] == expected
    assert {row["status"] for row in response.json()["data"]} == {status}


def test_no_filter_shows_everything(
    admin: TestClient, db_session: Session, vacancy: Vacancy
) -> None:
    make_report(db_session, vacancy, reporter(db_session, "a@example.com"))
    make_report(
        db_session, vacancy, reporter(db_session, "b@example.com"), status=ReportStatus.DISMISSED
    )

    assert admin.get(REPORTS).json()["meta"]["total"] == 2


def test_a_report_without_a_reporter_still_shows(
    admin: TestClient, db_session: Session, vacancy: Vacancy
) -> None:
    make_report(db_session, vacancy, None)

    assert admin.get(REPORTS).json()["data"][0]["reporter_email"] is None


def test_paging(admin: TestClient, db_session: Session, vacancy: Vacancy) -> None:
    for number in range(5):
        make_report(
            db_session, vacancy, reporter(db_session, f"u{number}@example.com"), minutes_ago=number
        )

    first = admin.get(REPORTS, params={"page": 1, "page_size": 2})
    last = admin.get(REPORTS, params={"page": 3, "page_size": 2})
    beyond = admin.get(REPORTS, params={"page": 4, "page_size": 2})

    assert len(first.json()["data"]) == 2 and first.json()["meta"]["total"] == 5
    assert len(last.json()["data"]) == 1
    assert beyond.json() == {"data": [], "meta": {"page": 4, "page_size": 2, "total": 5}}


@pytest.mark.parametrize(
    "params", [{"page": 0}, {"page_size": 0}, {"page_size": 51}, {"status": "resolved"}]
)
def test_bad_list_parameters_are_422(admin: TestClient, params: dict[str, Any]) -> None:
    assert admin.get(REPORTS, params=params).status_code == 422


def test_an_empty_list_is_a_normal_answer(admin: TestClient) -> None:
    assert admin.get(REPORTS).json() == {
        "data": [],
        "meta": {"page": 1, "page_size": 20, "total": 0},
    }


# ---------- dismissing ----------


def test_dismissing_leaves_the_vacancy_live(
    admin: TestClient, db_session: Session, vacancy: Vacancy
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))

    response = resolve(admin, item, note="Looks fine to us.")

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "dismissed" and data["handled_at"] is not None
    assert data["vacancy"]["is_live"] is True
    assert str(vacancy.id) in public_ids(admin)
    db_session.refresh(item)
    assert item.handled_by_user_id == get_user(db_session, "admin@example.com").id
    audit = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "report_dismissed")
    ).one()
    assert audit.entity_id == item.id
    assert audit.event_metadata["closed_vacancy"] is False
    assert audit.event_metadata["note"] == "Looks fine to us."


def test_dismissing_one_report_does_not_touch_the_others(
    admin: TestClient, db_session: Session, vacancy: Vacancy
) -> None:
    first = make_report(db_session, vacancy, reporter(db_session, "a@example.com"))
    second = make_report(db_session, vacancy, reporter(db_session, "b@example.com"))

    resolve(admin, first)

    db_session.refresh(second)
    assert second.status == ReportStatus.OPEN


def test_dismissing_cannot_suspend_the_employer(
    admin: TestClient, db_session: Session, vacancy: Vacancy, company: Employer
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))

    response = resolve(admin, item, suspend_employer=True, note="x")

    assert response.status_code == 422
    assert "suspend_employer" in fields_of(response)
    db_session.refresh(company)
    assert company.verification_status == S.APPROVED


# ---------- acting ----------


def test_acting_closes_the_vacancy_and_removes_it_from_public_search(
    admin: TestClient, db_session: Session, vacancy: Vacancy
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))
    assert str(vacancy.id) in public_ids(admin)

    response = resolve(admin, item, action="action", note="Confirmed scam.")

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["status"] == "actioned"
    assert data["vacancy"]["status"] == "closed" and data["vacancy"]["is_live"] is False
    assert str(vacancy.id) not in public_ids(admin)
    assert admin.get(f"{PUBLIC}/{vacancy.id}").status_code == 404
    assert admin.get(PUBLIC, params={"q": "money"}).json()["data"] == []
    db_session.refresh(vacancy)
    assert vacancy.status == VacancyStatus.CLOSED


def test_acting_leaves_the_employer_approved_unless_asked(
    admin: TestClient, db_session: Session, vacancy: Vacancy, company: Employer
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))

    resolve(admin, item, action="action")

    db_session.refresh(company)
    assert company.verification_status == S.APPROVED and can_publish(company)
    audit = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "report_actioned")
    ).one()
    assert audit.event_metadata["closed_vacancy"] is True
    assert audit.event_metadata["suspended_employer"] is False


def test_acting_settles_every_open_report_about_the_vacancy(
    admin: TestClient, db_session: Session, vacancy: Vacancy, company: Employer, world: World
) -> None:
    first = make_report(db_session, vacancy, reporter(db_session, "a@example.com"))
    second = make_report(db_session, vacancy, reporter(db_session, "b@example.com"))
    dismissed = make_report(
        db_session, vacancy, reporter(db_session, "c@example.com"), status=ReportStatus.DISMISSED
    )
    other_vacancy = add_vacancy(db_session, company, world, title="Another job")
    elsewhere = make_report(db_session, other_vacancy, reporter(db_session, "d@example.com"))

    data = resolve(admin, first, action="action").json()["data"]

    for item in (first, second, dismissed, elsewhere):
        db_session.refresh(item)
    assert (first.status, second.status) == (ReportStatus.ACTIONED, ReportStatus.ACTIONED)
    assert second.handled_by_user_id is not None
    assert dismissed.status == ReportStatus.DISMISSED  # history is not rewritten
    assert elsewhere.status == ReportStatus.OPEN  # a different vacancy is untouched
    assert data["open_reports_for_vacancy"] == 0
    audit = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "report_actioned")
    ).one()
    assert audit.event_metadata["reports_resolved"] == 2


def test_acting_can_also_suspend_the_employer(
    admin: TestClient, db_session: Session, vacancy: Vacancy, company: Employer
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))

    response = resolve(
        admin, item, action="action", suspend_employer=True, note="Several scam reports."
    )

    assert response.status_code == 200, response.text
    db_session.refresh(company)
    assert company.verification_status == S.SUSPENDED
    assert can_publish(company) is False
    assert response.json()["data"]["vacancy"]["employer_status"] == "suspended"
    event = db_session.scalars(select(EmployerVerificationEvent)).one()
    assert (event.from_status, event.to_status) == (S.APPROVED, S.SUSPENDED)
    assert event.reason == "Several scam reports."
    assert event.actor_user_id == get_user(db_session, "admin@example.com").id
    audit = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "report_actioned")
    ).one()
    assert audit.event_metadata["suspended_employer"] is True


def test_suspending_needs_a_reason_and_nothing_changes_without_one(
    admin: TestClient, db_session: Session, vacancy: Vacancy, company: Employer
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))

    for note in (None, "", "   "):
        body: dict[str, Any] = {"suspend_employer": True}
        if note is not None:
            body["note"] = note
        response = resolve(admin, item, action="action", **body)
        assert response.status_code == 422, note
        assert error_code(response) == "reason_required"

    db_session.refresh(item)
    db_session.refresh(vacancy)
    db_session.refresh(company)
    assert item.status == ReportStatus.OPEN
    assert vacancy.status == VacancyStatus.PUBLISHED
    assert company.verification_status == S.APPROVED
    assert str(vacancy.id) in public_ids(admin)


@pytest.mark.parametrize("status", [S.PENDING, S.REJECTED, S.SUSPENDED])
def test_an_employer_that_cannot_be_suspended_leaves_everything_as_it_was(
    admin: TestClient,
    db_session: Session,
    vacancy: Vacancy,
    company: Employer,
    status: S,
) -> None:
    company.verification_status = status
    item = make_report(db_session, vacancy, reporter(db_session))

    response = resolve(admin, item, action="action", suspend_employer=True, note="Because.")

    assert response.status_code == 409
    assert error_code(response) == "invalid_verification_transition"
    db_session.refresh(item)
    db_session.refresh(vacancy)
    assert item.status == ReportStatus.OPEN
    assert vacancy.status == VacancyStatus.PUBLISHED  # closing was rolled back too
    assert str(vacancy.id) in public_ids(admin)


def test_acting_on_a_vacancy_the_employer_already_closed_still_settles_the_report(
    admin: TestClient, db_session: Session, vacancy: Vacancy
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))
    vacancy.status = VacancyStatus.CLOSED
    db_session.commit()

    response = resolve(admin, item, action="action")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "actioned"
    audit = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "report_actioned")
    ).one()
    assert audit.event_metadata["closed_vacancy"] is False


# ---------- once only ----------


@pytest.mark.parametrize("first", ["dismiss", "action"])
@pytest.mark.parametrize("second", ["dismiss", "action"])
def test_a_report_can_only_be_handled_once(
    admin: TestClient, db_session: Session, vacancy: Vacancy, first: str, second: str
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))
    assert resolve(admin, item, action=first).status_code == 200

    response = resolve(admin, item, action=second)

    assert response.status_code == 409
    assert error_code(response) == "report_already_resolved"


def test_unknown_reports_are_404_and_bad_ids_are_422(admin: TestClient) -> None:
    missing = admin.post(
        f"{REPORTS}/{uuid4()}/resolve", json={"action": "dismiss"}, headers=csrf_headers(admin)
    )

    assert missing.status_code == 404 and error_code(missing) == "report_not_found"
    bad = admin.post(
        f"{REPORTS}/not-a-uuid/resolve", json={"action": "dismiss"}, headers=csrf_headers(admin)
    )
    assert bad.status_code == 422


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"action": "delete"},
        {"action": "dismiss", "extra": 1},
        {"action": "dismiss", "note": "x" * 1001},
    ],
)
def test_bad_resolve_bodies_are_422(
    admin: TestClient, db_session: Session, vacancy: Vacancy, body: dict[str, Any]
) -> None:
    item = make_report(db_session, vacancy, reporter(db_session))

    response = admin.post(f"{REPORTS}/{item.id}/resolve", json=body, headers=csrf_headers(admin))

    assert response.status_code == 422
    db_session.refresh(item)
    assert item.status == ReportStatus.OPEN


def test_the_openapi_lists_the_admin_report_routes(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert sorted(paths["/api/v1/admin/reports"]) == ["get"]
    assert sorted(paths["/api/v1/admin/reports/{report_id}/resolve"]) == ["post"]

"""Admin employer verification: permissions, decisions, history, paging."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AuditEvent,
    District,
    Employer,
    EmployerVerificationEvent,
    UserRole,
    VerificationStatus,
)
from app.services.employers import can_publish
from tests.api.auth_helpers import csrf_headers, error_code, get_user
from tests.api.profile_helpers import create_user, login_as

ADMIN = "/api/v1/admin/employers"
MINE = "/api/v1/employer/me"
S = VerificationStatus


@pytest.fixture
def district(db_session: Session) -> District:
    district = District(name="Gulu", region="Northern")
    db_session.add(district)
    db_session.flush()
    return district


@pytest.fixture
def admin(client: TestClient, db_session: Session) -> TestClient:
    create_user(db_session, "admin@example.com", UserRole.ADMIN)
    login_as(client, "admin@example.com")
    return client


@pytest.fixture
def employer_client(client: TestClient) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        yield other


def make_employer(
    db: Session,
    district: District,
    name: str = "Ssese Foods Ltd",
    status: S = S.PENDING,
    submitted_minutes_ago: int | None = 0,
) -> Employer:
    email = f"{name.lower().replace(' ', '.')}@example.com"
    create_user(db, email, UserRole.EMPLOYER)
    employer = Employer(
        owner_user_id=get_user(db, email).id,
        company_name=name,
        registration_number="80020012345678",
        contact_phone="+256414123456",
        description="We make juice.",
        district_id=district.id,
        verification_status=status,
        submitted_at=(
            None
            if submitted_minutes_ago is None
            else datetime.now(UTC) - timedelta(minutes=submitted_minutes_ago)
        ),
    )
    db.add(employer)
    db.flush()
    db.commit()
    return employer


def post(client: TestClient, employer: Employer, action: str, body: dict[str, Any] | None = None):
    return client.post(f"{ADMIN}/{employer.id}/{action}", json=body, headers=csrf_headers(client))


def audit_actions(db: Session) -> list[str]:
    return list(db.scalars(select(AuditEvent.action).where(AuditEvent.action.like("employer_%"))))


# ---------- permissions ----------


def test_anonymous_requests_are_401(client: TestClient, district: District, db_session: Session):
    employer = make_employer(db_session, district)

    responses = [
        client.get(ADMIN),
        client.get(f"{ADMIN}/{employer.id}"),
        client.post(f"{ADMIN}/{employer.id}/approve"),
        client.post(f"{ADMIN}/{employer.id}/reject", json={"reason": "x"}),
        client.post(f"{ADMIN}/{employer.id}/suspend", json={"reason": "x"}),
    ]

    for response in responses:
        assert response.status_code == 401
        assert error_code(response) == "not_authenticated"


@pytest.mark.parametrize("role", [UserRole.EMPLOYER, UserRole.JOB_SEEKER])
def test_other_roles_are_403_on_every_endpoint(
    client: TestClient, district: District, db_session: Session, role: UserRole
) -> None:
    employer = make_employer(db_session, district)
    create_user(db_session, "other@example.com", role)
    login_as(client, "other@example.com")

    responses = [
        client.get(ADMIN),
        client.get(f"{ADMIN}/{employer.id}"),
        post(client, employer, "approve"),
        post(client, employer, "reject", {"reason": "x"}),
        post(client, employer, "suspend", {"reason": "x"}),
    ]

    for response in responses:
        assert response.status_code == 403
        assert error_code(response) == "forbidden"
    db_session.refresh(employer)
    assert employer.verification_status == S.PENDING


def test_an_employer_cannot_approve_their_own_company_through_the_admin_api(
    client: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district)
    login_as(client, "ssese.foods.ltd@example.com")

    assert post(client, employer, "approve").status_code == 403
    db_session.refresh(employer)
    assert employer.verification_status == S.PENDING
    assert can_publish(employer) is False


def test_decisions_need_the_csrf_header(
    admin: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district)

    assert admin.post(f"{ADMIN}/{employer.id}/approve").status_code == 403
    assert admin.post(f"{ADMIN}/{employer.id}/reject", json={"reason": "x"}).status_code == 403
    db_session.refresh(employer)
    assert employer.verification_status == S.PENDING


# ---------- approve ----------


def test_approving_lets_the_employer_publish(
    admin: TestClient,
    employer_client: TestClient,
    district: District,
    db_session: Session,
) -> None:
    employer = make_employer(db_session, district)
    login_as(employer_client, "ssese.foods.ltd@example.com")
    assert employer_client.get(MINE).json()["data"]["can_publish"] is False

    response = post(admin, employer, "approve")

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["verification_status"] == "approved"
    assert data["decided_at"] is not None
    db_session.refresh(employer)
    assert can_publish(employer) is True
    shown = employer_client.get(MINE).json()["data"]
    assert shown["verification_status"] == "approved" and shown["can_publish"] is True


def test_the_decision_is_recorded_with_actor_in_history_and_audit(
    admin: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district)

    response = post(admin, employer, "approve")

    (item,) = response.json()["data"]["history"]
    assert (item["from_status"], item["to_status"]) == ("pending", "approved")
    assert item["actor_email"] == "admin@example.com"
    event = db_session.scalars(select(EmployerVerificationEvent)).one()
    assert event.actor_user_id == get_user(db_session, "admin@example.com").id
    audit = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "employer_approved")
    ).one()
    assert audit.actor_user_id == event.actor_user_id
    assert audit.entity_id == employer.id


@pytest.mark.parametrize("status", [S.DRAFT, S.APPROVED, S.REJECTED])
def test_approving_from_the_wrong_status_is_409(
    admin: TestClient, district: District, db_session: Session, status: S
) -> None:
    employer = make_employer(db_session, district, status=status)

    response = post(admin, employer, "approve")

    assert response.status_code == 409
    assert error_code(response) == "invalid_verification_transition"
    db_session.refresh(employer)
    assert employer.verification_status == status
    assert audit_actions(db_session) == []


# ---------- reject ----------


def test_rejecting_stores_the_reason_and_the_employer_sees_it(
    admin: TestClient, employer_client: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district)

    response = post(
        admin, employer, "reject", {"reason": "  We could not find your registration. "}
    )

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["verification_status"] == "rejected"
    assert data["history"][-1]["reason"] == "We could not find your registration."
    login_as(employer_client, "ssese.foods.ltd@example.com")
    mine = employer_client.get(MINE).json()["data"]
    assert mine["verification_status"] == "rejected"
    assert mine["status_reason"] == "We could not find your registration."
    assert mine["can_publish"] is False


@pytest.mark.parametrize("reason", ["", "   ", "\n\t"])
def test_rejecting_needs_a_reason(
    admin: TestClient, district: District, db_session: Session, reason: str
) -> None:
    employer = make_employer(db_session, district)

    response = post(admin, employer, "reject", {"reason": reason})

    assert response.status_code == 422
    assert error_code(response) == "reason_required"
    assert "reason" in response.json()["error"]["details"]["fields"]
    db_session.refresh(employer)
    assert employer.verification_status == S.PENDING
    assert db_session.scalars(select(EmployerVerificationEvent)).all() == []


@pytest.mark.parametrize("body", [None, {}, {"why": "x"}, {"reason": "x", "extra": 1}])
def test_a_missing_or_malformed_body_is_a_validation_error(
    admin: TestClient, district: District, db_session: Session, body: dict[str, Any] | None
) -> None:
    employer = make_employer(db_session, district)

    for action in ("reject", "suspend"):
        response = post(admin, employer, action, body)
        assert response.status_code == 422, (action, body)
        assert error_code(response) == "validation_error"


def test_a_very_long_reason_is_refused(
    admin: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district)

    response = post(admin, employer, "reject", {"reason": "x" * 1001})

    assert response.status_code == 422
    assert "reason" in response.json()["error"]["details"]["fields"]


@pytest.mark.parametrize("status", [S.DRAFT, S.APPROVED, S.SUSPENDED])
def test_rejecting_from_the_wrong_status_is_409(
    admin: TestClient, district: District, db_session: Session, status: S
) -> None:
    employer = make_employer(db_session, district, status=status)

    response = post(admin, employer, "reject", {"reason": "No."})

    assert response.status_code == 409
    assert error_code(response) == "invalid_verification_transition"


# ---------- suspend and reinstate ----------


def test_suspending_blocks_publishing_and_approving_again_restores_it(
    admin: TestClient, employer_client: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district, status=S.APPROVED)
    login_as(employer_client, "ssese.foods.ltd@example.com")
    assert employer_client.get(MINE).json()["data"]["can_publish"] is True

    suspended = post(admin, employer, "suspend", {"reason": "Complaints from applicants."})

    assert suspended.status_code == 200, suspended.text
    assert suspended.json()["data"]["verification_status"] == "suspended"
    db_session.refresh(employer)
    assert can_publish(employer) is False
    mine = employer_client.get(MINE).json()["data"]
    assert mine["can_publish"] is False
    assert mine["status_reason"] == "Complaints from applicants."

    restored = post(admin, employer, "approve")

    assert restored.status_code == 200
    db_session.refresh(employer)
    assert can_publish(employer) is True
    assert employer_client.get(MINE).json()["data"]["status_reason"] is None
    assert [(h["from_status"], h["to_status"]) for h in restored.json()["data"]["history"]] == [
        ("approved", "suspended"),
        ("suspended", "approved"),
    ]


def test_suspending_needs_a_reason(
    admin: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district, status=S.APPROVED)

    response = post(admin, employer, "suspend", {"reason": " "})

    assert response.status_code == 422
    assert error_code(response) == "reason_required"
    db_session.refresh(employer)
    assert can_publish(employer) is True


@pytest.mark.parametrize("status", [S.DRAFT, S.PENDING, S.REJECTED, S.SUSPENDED])
def test_suspending_from_the_wrong_status_is_409(
    admin: TestClient, district: District, db_session: Session, status: S
) -> None:
    employer = make_employer(db_session, district, status=status)

    response = post(admin, employer, "suspend", {"reason": "No."})

    assert response.status_code == 409
    assert error_code(response) == "invalid_verification_transition"


def test_deciding_twice_is_refused_the_second_time(
    admin: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district)

    assert post(admin, employer, "approve").status_code == 200
    assert post(admin, employer, "approve").status_code == 409
    assert post(admin, employer, "reject", {"reason": "Late."}).status_code == 409
    assert audit_actions(db_session) == ["employer_approved"]


def test_the_audit_event_carries_the_reason(
    admin: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district)

    post(admin, employer, "reject", {"reason": "Unclear registration."})

    audit = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "employer_rejected")
    ).one()
    assert audit.event_metadata == {
        "from": "pending",
        "to": "rejected",
        "reason": "Unclear registration.",
    }
    assert audit.actor_user_id == get_user(db_session, "admin@example.com").id


# ---------- unknown ids ----------


@pytest.mark.parametrize("action", ["approve", "reject", "suspend"])
def test_unknown_employer_is_404(admin: TestClient, action: str) -> None:
    response = admin.post(
        f"{ADMIN}/{uuid4()}/{action}", json={"reason": "x"}, headers=csrf_headers(admin)
    )

    assert response.status_code == 404
    assert error_code(response) == "employer_not_found"


def test_detail_of_an_unknown_employer_is_404_and_a_bad_id_is_422(admin: TestClient) -> None:
    assert admin.get(f"{ADMIN}/{uuid4()}").status_code == 404
    assert admin.get(f"{ADMIN}/not-a-uuid").status_code == 422


# ---------- detail ----------


def test_the_detail_shows_the_profile_owner_and_history(
    admin: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district)
    post(admin, employer, "reject", {"reason": "Needs a TIN."})

    response = admin.get(f"{ADMIN}/{employer.id}")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["company_name"] == "Ssese Foods Ltd"
    assert data["registration_number"] == "80020012345678"
    assert data["contact_phone"] == "+256414123456"
    assert data["district_name"] == "Gulu"
    assert data["owner"] == {
        "id": str(get_user(db_session, "ssese.foods.ltd@example.com").id),
        "email": "ssese.foods.ltd@example.com",
        "email_verified": True,
    }
    assert len(data["history"]) == 1
    assert data["history"][0]["reason"] == "Needs a TIN."


def test_history_is_oldest_first(
    admin: TestClient, district: District, db_session: Session
) -> None:
    employer = make_employer(db_session, district)
    post(admin, employer, "approve")
    post(admin, employer, "suspend", {"reason": "One."})
    post(admin, employer, "approve")

    history = admin.get(f"{ADMIN}/{employer.id}").json()["data"]["history"]

    assert [h["to_status"] for h in history] == ["approved", "suspended", "approved"]


# ---------- listing, filtering, paging ----------


def seed_many(db: Session, district: District) -> None:
    make_employer(db, district, "Alpha Ltd", S.PENDING, submitted_minutes_ago=30)
    make_employer(db, district, "Bravo Ltd", S.PENDING, submitted_minutes_ago=10)
    make_employer(db, district, "Charlie Ltd", S.APPROVED, submitted_minutes_ago=20)
    make_employer(db, district, "Delta Ltd", S.REJECTED, submitted_minutes_ago=40)
    make_employer(db, district, "Echo Ltd", S.DRAFT, submitted_minutes_ago=None)


def names(response: Any) -> list[str]:
    return [item["company_name"] for item in response.json()["data"]]


def test_the_list_is_newest_submitted_first_with_drafts_last(
    admin: TestClient, district: District, db_session: Session
) -> None:
    seed_many(db_session, district)

    response = admin.get(ADMIN)

    assert response.status_code == 200
    assert names(response) == ["Bravo Ltd", "Charlie Ltd", "Alpha Ltd", "Delta Ltd", "Echo Ltd"]
    assert response.json()["meta"] == {"page": 1, "page_size": 20, "total": 5}


def test_a_list_item_has_what_the_queue_needs(
    admin: TestClient, district: District, db_session: Session
) -> None:
    make_employer(db_session, district)

    (item,) = admin.get(ADMIN).json()["data"]

    assert set(item) == {
        "id",
        "company_name",
        "owner_email",
        "district_name",
        "verification_status",
        "submitted_at",
        "decided_at",
    }
    assert item["owner_email"] == "ssese.foods.ltd@example.com"
    assert item["district_name"] == "Gulu"


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ("pending", ["Bravo Ltd", "Alpha Ltd"]),
        ("approved", ["Charlie Ltd"]),
        ("rejected", ["Delta Ltd"]),
        ("draft", ["Echo Ltd"]),
        ("suspended", []),
    ],
)
def test_filtering_by_status(
    admin: TestClient, district: District, db_session: Session, status: str, expected: list[str]
) -> None:
    seed_many(db_session, district)

    response = admin.get(ADMIN, params={"status": status})

    assert names(response) == expected
    assert response.json()["meta"]["total"] == len(expected)


def test_an_unknown_status_is_422(admin: TestClient) -> None:
    response = admin.get(ADMIN, params={"status": "banned"})

    assert response.status_code == 422
    assert error_code(response) == "validation_error"


def test_paging(admin: TestClient, district: District, db_session: Session) -> None:
    seed_many(db_session, district)

    first = admin.get(ADMIN, params={"page": 1, "page_size": 2})
    second = admin.get(ADMIN, params={"page": 2, "page_size": 2})
    last = admin.get(ADMIN, params={"page": 3, "page_size": 2})
    beyond = admin.get(ADMIN, params={"page": 4, "page_size": 2})

    assert names(first) == ["Bravo Ltd", "Charlie Ltd"]
    assert names(second) == ["Alpha Ltd", "Delta Ltd"]
    assert names(last) == ["Echo Ltd"]
    assert beyond.json() == {"data": [], "meta": {"page": 4, "page_size": 2, "total": 5}}
    assert first.json()["meta"] == {"page": 1, "page_size": 2, "total": 5}


def test_paging_and_filtering_together(
    admin: TestClient, district: District, db_session: Session
) -> None:
    seed_many(db_session, district)

    response = admin.get(ADMIN, params={"status": "pending", "page": 2, "page_size": 1})

    assert names(response) == ["Alpha Ltd"]
    assert response.json()["meta"] == {"page": 2, "page_size": 1, "total": 2}


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page": -1},
        {"page": "x"},
        {"page_size": 0},
        {"page_size": 51},
        {"page_size": "x"},
    ],
)
def test_bad_paging_values_are_422(admin: TestClient, params: dict[str, Any]) -> None:
    response = admin.get(ADMIN, params=params)

    assert response.status_code == 422
    assert error_code(response) == "validation_error"


def test_the_largest_page_size_is_fifty(
    admin: TestClient, district: District, db_session: Session
) -> None:
    make_employer(db_session, district)

    assert admin.get(ADMIN, params={"page_size": 50}).status_code == 200


def test_an_empty_list_is_still_a_valid_page(admin: TestClient) -> None:
    assert admin.get(ADMIN).json() == {"data": [], "meta": {"page": 1, "page_size": 20, "total": 0}}


def test_openapi_lists_the_five_admin_operations(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert {p: sorted(m) for p, m in paths.items() if "/admin/employers" in p} == {
        "/api/v1/admin/employers": ["get"],
        "/api/v1/admin/employers/{employer_id}": ["get"],
        "/api/v1/admin/employers/{employer_id}/approve": ["post"],
        "/api/v1/admin/employers/{employer_id}/reject": ["post"],
        "/api/v1/admin/employers/{employer_id}/suspend": ["post"],
    }

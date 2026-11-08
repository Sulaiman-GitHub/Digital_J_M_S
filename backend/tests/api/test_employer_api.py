"""Employer profile API: profile, submission, permissions, edit rules."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AuditEvent,
    District,
    Employer,
    EmployerVerificationEvent,
    UserRole,
    VerificationStatus,
)
from tests.api.auth_helpers import (
    csrf_headers,
    error_code,
    get_user,
    register_and_login,
)
from tests.api.profile_helpers import create_user, login_as

EMPLOYER = "/api/v1/employer/me"
SUBMIT = "/api/v1/employer/me/submit"
S = VerificationStatus


@pytest.fixture
def district(db_session: Session) -> District:
    district = District(name="Gulu", region="Northern")
    db_session.add(district)
    db_session.flush()
    return district


@pytest.fixture
def boss(client: TestClient, db_session: Session) -> TestClient:
    """A verified employer, logged in."""
    create_user(db_session, "boss@example.com", UserRole.EMPLOYER)
    login_as(client, "boss@example.com")
    return client


@pytest.fixture
def second_client(client: TestClient) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        yield other


def payload(district: District, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "company_name": "Ssese Foods Ltd",
        "registration_number": "80020012345678",
        "website": "https://ssese-foods.example.com",
        "contact_phone": "0414 123456",
        "district_id": str(district.id),
        "description": "We process and sell fruit juice across northern Uganda.",
    }
    body.update(overrides)
    return body


def put(client: TestClient, body: dict[str, Any]):
    return client.put(EMPLOYER, json=body, headers=csrf_headers(client))


def submit(client: TestClient):
    return client.post(SUBMIT, headers=csrf_headers(client))


def employer_row(db: Session, email: str = "boss@example.com") -> Employer:
    user = get_user(db, email)
    return db.scalars(select(Employer).where(Employer.owner_user_id == user.id)).one()


def set_status(db: Session, status: S, email: str = "boss@example.com") -> None:
    employer = employer_row(db, email)
    employer.verification_status = status
    db.commit()


def history(db: Session) -> list[tuple[str, str]]:
    rows = db.scalars(
        select(EmployerVerificationEvent).order_by(EmployerVerificationEvent.created_at)
    )
    return [(row.from_status.value, row.to_status.value) for row in rows]


# ---------- reading and creating ----------


def test_there_is_no_company_until_one_is_created(boss: TestClient) -> None:
    response = boss.get(EMPLOYER)

    assert response.status_code == 404
    assert error_code(response) == "employer_not_found"


def test_the_first_save_creates_a_draft(boss: TestClient, district: District) -> None:
    response = put(boss, payload(district))

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["verification_status"] == "draft"
    assert data["can_publish"] is False
    assert data["status_reason"] is None
    assert data["submitted_at"] is None and data["decided_at"] is None
    assert data["company_name"] == "Ssese Foods Ltd"
    assert data["contact_phone"] == "+256414123456"
    assert data["district_id"] == str(district.id)
    assert boss.get(EMPLOYER).json()["data"] == data


def test_a_save_replaces_the_fields_and_keeps_one_company(
    boss: TestClient, district: District, db_session: Session
) -> None:
    put(boss, payload(district))

    response = put(boss, payload(district, company_name="Ssese Juice Ltd", website=None))

    assert response.status_code == 200
    assert response.json()["data"]["company_name"] == "Ssese Juice Ltd"
    assert response.json()["data"]["website"] is None
    assert db_session.scalar(select(func.count()).select_from(Employer)) == 1


def test_only_a_name_and_a_district_are_needed_to_save_a_draft(
    boss: TestClient, district: District
) -> None:
    response = put(boss, {"company_name": "Tiny Ltd", "district_id": str(district.id)})

    assert response.status_code == 200
    assert response.json()["data"]["registration_number"] is None


def test_values_are_cleaned(boss: TestClient, district: District) -> None:
    response = put(
        boss,
        payload(
            district,
            company_name="  Ssese   Foods\tLtd ",
            registration_number="  8002 0012  ",
            contact_phone="+256 772-123-456",
            website="  https://x.example.com/about ",
            description="  Line one\r\nLine two  ",
        ),
    )

    data = response.json()["data"]
    assert data["company_name"] == "Ssese Foods Ltd"
    assert data["registration_number"] == "8002 0012"
    assert data["contact_phone"] == "+256772123456"
    assert data["website"] == "https://x.example.com/about"
    assert data["description"] == "Line one\nLine two"


# ---------- validation ----------


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("company_name", ""),
        ("company_name", " "),
        ("company_name", "A"),
        ("company_name", "x" * 201),
        ("registration_number", "x" * 51),
        ("website", "ssese-foods.example.com"),
        ("website", "javascript:alert(1)"),
        ("website", "ftp://files.example.com"),
        ("website", "https://has space.example.com"),
        ("website", "https://" + "a" * 300 + ".com"),
        ("contact_phone", "12345"),
        ("contact_phone", "0112 123456"),
        ("contact_phone", "abc"),
        ("description", "x" * 2001),
    ],
)
def test_invalid_values_are_422_with_the_field_named(
    boss: TestClient, district: District, field: str, value: str
) -> None:
    response = put(boss, payload(district, **{field: value}))

    assert response.status_code == 422, (field, value)
    assert error_code(response) == "validation_error"
    assert field in response.json()["error"]["details"]["fields"]


@pytest.mark.parametrize("phone", ["0772123456", "+256772123456", "0414 123456", "256 312 123456"])
def test_ugandan_mobile_and_landline_numbers_are_accepted(
    boss: TestClient, district: District, phone: str
) -> None:
    assert put(boss, payload(district, contact_phone=phone)).status_code == 200


def test_the_district_must_exist(boss: TestClient, district: District) -> None:
    response = put(boss, payload(district, district_id="3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10"))

    assert response.status_code == 422
    assert "district_id" in response.json()["error"]["details"]["fields"]


def test_the_company_name_and_district_are_required(boss: TestClient) -> None:
    response = put(boss, {})

    assert response.status_code == 422
    assert {"company_name", "district_id"} <= set(response.json()["error"]["details"]["fields"])


def test_the_status_and_owner_cannot_be_chosen(boss: TestClient, district: District) -> None:
    response = put(
        boss,
        payload(
            district,
            verification_status="approved",
            owner_user_id="3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10",
            decided_at="2026-01-01T00:00:00Z",
        ),
    )

    assert response.status_code == 422
    assert {"verification_status", "owner_user_id", "decided_at"} <= set(
        response.json()["error"]["details"]["fields"]
    )


# ---------- submitting ----------


def test_submitting_a_complete_profile_makes_it_pending(
    boss: TestClient, district: District, db_session: Session
) -> None:
    put(boss, payload(district))

    response = submit(boss)

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["verification_status"] == "pending"
    assert data["submitted_at"] is not None
    assert data["can_publish"] is False
    assert history(db_session) == [("draft", "pending")]
    action = db_session.scalars(
        select(AuditEvent.action).where(AuditEvent.action.like("employer_%"))
    )
    assert list(action) == ["employer_pending"]


def test_submitting_without_a_profile_is_404(boss: TestClient) -> None:
    response = submit(boss)

    assert response.status_code == 404
    assert error_code(response) == "employer_not_found"


def test_an_incomplete_profile_cannot_be_submitted(
    boss: TestClient, district: District, db_session: Session
) -> None:
    put(boss, {"company_name": "Tiny Ltd", "district_id": str(district.id)})

    response = submit(boss)

    assert response.status_code == 422
    assert error_code(response) == "profile_incomplete"
    fields = response.json()["error"]["details"]["fields"]
    assert set(fields) == {"registration_number", "description", "contact_phone", "website"}
    assert employer_row(db_session).verification_status == S.DRAFT
    assert history(db_session) == []


@pytest.mark.parametrize(
    ("overrides", "missing"),
    [
        ({"registration_number": None}, {"registration_number"}),
        ({"description": None}, {"description"}),
        ({"website": None, "contact_phone": None}, {"website", "contact_phone"}),
    ],
)
def test_each_missing_item_is_named(
    boss: TestClient, district: District, overrides: dict[str, Any], missing: set[str]
) -> None:
    put(boss, payload(district, **overrides))

    response = submit(boss)

    assert response.status_code == 422
    assert set(response.json()["error"]["details"]["fields"]) == missing


@pytest.mark.parametrize("contact", [{"website": None}, {"contact_phone": None}])
def test_a_phone_or_a_website_is_enough(
    boss: TestClient, district: District, contact: dict[str, None]
) -> None:
    put(boss, payload(district, **contact))

    assert submit(boss).status_code == 200


def test_an_unverified_email_cannot_submit(
    client: TestClient, district: District, db_session: Session
) -> None:
    register_and_login(client, "new@example.com", role="employer")
    put(client, payload(district))

    response = submit(client)

    assert response.status_code == 403
    assert error_code(response) == "email_not_verified"
    assert employer_row(db_session, "new@example.com").verification_status == S.DRAFT


def test_an_unverified_email_can_still_save_a_draft(client: TestClient, district: District) -> None:
    register_and_login(client, "new@example.com", role="employer")

    assert put(client, payload(district)).status_code == 200


@pytest.mark.parametrize("status", [S.PENDING, S.APPROVED, S.SUSPENDED])
def test_only_a_draft_or_rejected_profile_can_be_submitted(
    boss: TestClient, district: District, db_session: Session, status: S
) -> None:
    put(boss, payload(district))
    set_status(db_session, status)

    response = submit(boss)

    assert response.status_code == 409
    assert error_code(response) == "invalid_verification_transition"
    assert employer_row(db_session).verification_status == status


def test_a_rejected_employer_can_edit_and_resubmit(
    boss: TestClient, district: District, db_session: Session
) -> None:
    put(boss, payload(district))
    submit(boss)
    employer = employer_row(db_session)
    from app.services.employers import change_status

    admin = create_admin(db_session)
    change_status(db_session, employer, S.REJECTED, actor=admin, reason="Registration unclear.")
    db_session.commit()

    shown = boss.get(EMPLOYER).json()["data"]
    assert shown["verification_status"] == "rejected"
    assert shown["status_reason"] == "Registration unclear."

    assert put(boss, payload(district, registration_number="80020099999999")).status_code == 200
    assert employer_row(db_session).verification_status == S.REJECTED  # not pending until submitted
    resubmitted = submit(boss)

    assert resubmitted.status_code == 200
    assert resubmitted.json()["data"]["verification_status"] == "pending"
    assert resubmitted.json()["data"]["status_reason"] is None
    assert history(db_session)[-1] == ("rejected", "pending")


def create_admin(db: Session):
    create_user(db, "admin@example.com", UserRole.ADMIN)
    return get_user(db, "admin@example.com")


# ---------- editing by status ----------


@pytest.mark.parametrize("status", [S.PENDING, S.SUSPENDED])
def test_the_profile_is_read_only_while_pending_or_suspended(
    boss: TestClient, district: District, db_session: Session, status: S
) -> None:
    put(boss, payload(district))
    set_status(db_session, status)

    response = put(boss, payload(district, company_name="Changed Ltd"))

    assert response.status_code == 409
    assert error_code(response) == "employer_profile_locked"
    assert employer_row(db_session).company_name == "Ssese Foods Ltd"


@pytest.mark.parametrize(
    "change", [{"company_name": "Ssese Juice Ltd"}, {"registration_number": "80020099999999"}]
)
def test_changing_a_key_field_of_an_approved_profile_sends_it_back_to_pending(
    boss: TestClient, district: District, db_session: Session, change: dict[str, str]
) -> None:
    put(boss, payload(district))
    set_status(db_session, S.APPROVED)

    response = put(boss, payload(district, **change))

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["verification_status"] == "pending"
    assert data["can_publish"] is False
    assert history(db_session) == [("approved", "pending")]
    event = db_session.scalars(select(EmployerVerificationEvent)).one()
    assert "changed" in (event.reason or "")
    actions = db_session.scalars(
        select(AuditEvent.action).where(AuditEvent.action.like("employer_%"))
    )
    assert list(actions) == ["employer_pending"]


@pytest.mark.parametrize(
    "change",
    [
        {"website": "https://new.example.com"},
        {"contact_phone": "0772 000111"},
        {"description": "A new description."},
    ],
)
def test_changing_other_fields_of_an_approved_profile_keeps_it_approved(
    boss: TestClient, district: District, db_session: Session, change: dict[str, str]
) -> None:
    put(boss, payload(district))
    set_status(db_session, S.APPROVED)

    response = put(boss, payload(district, **change))

    assert response.status_code == 200
    assert response.json()["data"]["verification_status"] == "approved"
    assert response.json()["data"]["can_publish"] is True
    assert history(db_session) == []


def test_saving_an_approved_profile_without_changes_keeps_it_approved(
    boss: TestClient, district: District, db_session: Session
) -> None:
    put(boss, payload(district))
    set_status(db_session, S.APPROVED)

    assert put(boss, payload(district)).json()["data"]["verification_status"] == "approved"
    assert history(db_session) == []


# ---------- permissions ----------


def test_anonymous_requests_are_401(client: TestClient, district: District) -> None:
    responses = [
        client.get(EMPLOYER),
        client.put(EMPLOYER, json=payload(district)),
        client.post(SUBMIT),
    ]

    for response in responses:
        assert response.status_code == 401
        assert error_code(response) == "not_authenticated"


@pytest.mark.parametrize("role", [UserRole.JOB_SEEKER, UserRole.ADMIN])
def test_other_roles_are_403(
    client: TestClient, db_session: Session, district: District, role: UserRole
) -> None:
    create_user(db_session, "other@example.com", role)
    login_as(client, "other@example.com")

    responses = [client.get(EMPLOYER), put(client, payload(district)), submit(client)]

    for response in responses:
        assert response.status_code == 403
        assert set(response.json()) == {"error"}
    assert db_session.scalar(select(func.count()).select_from(Employer)) == 0


def test_writes_need_the_csrf_header(boss: TestClient, district: District) -> None:
    assert boss.put(EMPLOYER, json=payload(district)).status_code == 403
    put(boss, payload(district))
    assert boss.post(SUBMIT).status_code == 403


def test_an_employer_cannot_approve_themselves_through_any_route(
    boss: TestClient, district: District, db_session: Session
) -> None:
    put(boss, payload(district))
    submit(boss)

    for path in ("/api/v1/employer/me/approve", "/api/v1/admin/employers/x/approve"):
        response = boss.post(path, headers=csrf_headers(boss))
        assert response.status_code in (403, 404, 405), path

    assert employer_row(db_session).verification_status == S.PENDING


def test_employers_only_ever_see_their_own_company(
    boss: TestClient, second_client: TestClient, district: District, db_session: Session
) -> None:
    put(boss, payload(district))
    create_user(db_session, "rival@example.com", UserRole.EMPLOYER)
    login_as(second_client, "rival@example.com")

    assert second_client.get(EMPLOYER).status_code == 404
    assert put(second_client, payload(district, company_name="Rival Ltd")).status_code == 200
    assert boss.get(EMPLOYER).json()["data"]["company_name"] == "Ssese Foods Ltd"
    assert second_client.get(EMPLOYER).json()["data"]["company_name"] == "Rival Ltd"


def test_the_openapi_lists_only_the_own_employer_paths(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert {p: sorted(m) for p, m in paths.items() if p.startswith("/api/v1/employer/me")} == {
        "/api/v1/employer/me": ["get", "put"],
        "/api/v1/employer/me/submit": ["post"],
    }

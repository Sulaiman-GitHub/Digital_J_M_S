"""The publishing gate (Phase 3 gate): only an approved employer gets through, even through the API.

The vacancy routes arrive in Phase 4 and will use the same dependency. Here a probe route stands in
for "publish a vacancy".
"""

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.deps import PublishingEmployer, require_csrf
from app.models import District, Employer, UserRole, VerificationStatus
from tests.api.auth_helpers import csrf_headers, error_code, get_user
from tests.api.profile_helpers import create_user, login_as

PROBE = "/api/v1/_publish_probe"
S = VerificationStatus


@pytest.fixture
def probe(client: TestClient) -> TestClient:
    @client.app.post(PROBE, dependencies=[Depends(require_csrf)])  # type: ignore[attr-defined]
    def publish(employer: PublishingEmployer) -> dict[str, dict[str, str]]:
        return {"data": {"company_id": str(employer.id)}}

    return client


def make_company(db: Session, email: str, status: S) -> Employer:
    district = db.query(District).first() or District(name="Gulu", region="Northern")
    db.add(district)
    db.flush()
    create_user(db, email, UserRole.EMPLOYER)
    employer = Employer(
        owner_user_id=get_user(db, email).id,
        company_name="Ssese Foods Ltd",
        district_id=district.id,
        verification_status=status,
    )
    db.add(employer)
    db.commit()
    return employer


def publish(client: TestClient):
    return client.post(PROBE, headers=csrf_headers(client))


@pytest.mark.parametrize("status", [S.DRAFT, S.PENDING, S.REJECTED, S.SUSPENDED])
def test_an_employer_who_is_not_approved_cannot_publish(
    probe: TestClient, db_session: Session, status: S
) -> None:
    make_company(db_session, "boss@example.com", status)
    login_as(probe, "boss@example.com")

    response = publish(probe)

    assert response.status_code == 403
    assert error_code(response) == "employer_not_verified"
    assert set(response.json()) == {"error"}


def test_an_employer_with_no_company_profile_cannot_publish(
    probe: TestClient, db_session: Session
) -> None:
    create_user(db_session, "boss@example.com", UserRole.EMPLOYER)
    login_as(probe, "boss@example.com")

    response = publish(probe)

    assert response.status_code == 403
    assert error_code(response) == "employer_not_verified"


def test_an_approved_employer_can_publish(probe: TestClient, db_session: Session) -> None:
    employer = make_company(db_session, "boss@example.com", S.APPROVED)
    login_as(probe, "boss@example.com")

    response = publish(probe)

    assert response.status_code == 200
    assert response.json()["data"]["company_id"] == str(employer.id)


def test_suspending_takes_publishing_away_at_once(probe: TestClient, db_session: Session) -> None:
    employer = make_company(db_session, "boss@example.com", S.APPROVED)
    login_as(probe, "boss@example.com")
    assert publish(probe).status_code == 200

    employer.verification_status = S.SUSPENDED
    db_session.commit()

    assert publish(probe).status_code == 403


def test_changing_the_company_name_takes_publishing_away_until_it_is_approved_again(
    probe: TestClient, db_session: Session
) -> None:
    employer = make_company(db_session, "boss@example.com", S.APPROVED)
    login_as(probe, "boss@example.com")
    body = {
        "company_name": "Renamed Ltd",
        "district_id": str(employer.district_id),
        "registration_number": "80020012345678",
        "contact_phone": "0414 123456",
        "description": "Juice.",
    }

    assert (
        probe.put("/api/v1/employer/me", json=body, headers=csrf_headers(probe)).status_code == 200
    )

    response = publish(probe)
    assert response.status_code == 403
    assert error_code(response) == "employer_not_verified"


@pytest.mark.parametrize("role", [UserRole.JOB_SEEKER, UserRole.ADMIN])
def test_other_roles_are_refused_by_role(
    probe: TestClient, db_session: Session, role: UserRole
) -> None:
    create_user(db_session, "other@example.com", role)
    login_as(probe, "other@example.com")

    response = publish(probe)

    assert response.status_code == 403
    assert error_code(response) == "forbidden"


def test_anonymous_requests_are_401(probe: TestClient) -> None:
    response = probe.post(PROBE)

    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"


def test_publishing_needs_the_csrf_header(probe: TestClient, db_session: Session) -> None:
    make_company(db_session, "boss@example.com", S.APPROVED)
    login_as(probe, "boss@example.com")

    assert probe.post(PROBE).status_code == 403


def test_one_employer_is_never_judged_by_another_employers_approval(
    probe: TestClient, db_session: Session
) -> None:
    make_company(db_session, "approved@example.com", S.APPROVED)
    make_company(db_session, "pending@example.com", S.PENDING)
    login_as(probe, "pending@example.com")

    assert publish(probe).status_code == 403

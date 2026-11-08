"""Admin creates vacancies for partner employers."""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AuditEvent, UserRole, Vacancy, VerificationStatus
from tests.api.auth_helpers import csrf_headers, error_code
from tests.api.profile_helpers import create_user, login_as
from tests.api.vacancy_helpers import (
    ADMIN_VACANCIES,
    EMPLOYER_VACANCIES,
    World,
    fields_of,
    make_company,
    make_world,
    payload,
)

S = VerificationStatus


@pytest.fixture
def world(db_session: Session) -> World:
    return make_world(db_session)


@pytest.fixture
def admin(client: TestClient, db_session: Session) -> TestClient:
    create_user(db_session, "admin@example.com", UserRole.ADMIN)
    login_as(client, "admin@example.com")
    return client


def post(client: TestClient, body: dict[str, Any]):
    return client.post(ADMIN_VACANCIES, json=body, headers=csrf_headers(client))


def test_an_admin_creates_a_draft_for_a_partner(
    admin: TestClient, db_session: Session, world: World
) -> None:
    partner = make_company(db_session, world, "partner@example.com", name="Partner Ltd")

    response = post(admin, {**payload(world), "employer_id": str(partner.id)})

    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["status"] == "draft"
    assert data["employer_id"] == str(partner.id)
    assert data["created_by_admin"] is True
    assert data["title"] == "Accounts Assistant"


def test_it_can_be_published_straight_away(
    admin: TestClient, db_session: Session, world: World
) -> None:
    partner = make_company(db_session, world, "partner@example.com")

    response = post(admin, {**payload(world), "employer_id": str(partner.id), "publish": True})

    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["status"] == "published" and data["is_live"] is True
    audit = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "vacancy_published")
    ).one()
    assert audit.actor_user_id is not None


def test_publishing_at_once_still_needs_a_complete_vacancy_and_saves_nothing_otherwise(
    admin: TestClient, db_session: Session, world: World
) -> None:
    partner = make_company(db_session, world, "partner@example.com")

    response = post(
        admin, {**payload(world, description=None), "employer_id": str(partner.id), "publish": True}
    )

    assert response.status_code == 422
    assert error_code(response) == "vacancy_incomplete"
    assert "description" in fields_of(response)
    assert db_session.scalar(select(func.count()).select_from(Vacancy)) == 0


@pytest.mark.parametrize("status", [S.DRAFT, S.PENDING, S.REJECTED, S.SUSPENDED])
def test_the_partner_must_be_approved(
    admin: TestClient, db_session: Session, world: World, status: S
) -> None:
    partner = make_company(db_session, world, "partner@example.com", status=status)

    response = post(admin, {**payload(world), "employer_id": str(partner.id)})

    assert response.status_code == 409
    assert error_code(response) == "employer_not_verified"
    assert db_session.scalar(select(func.count()).select_from(Vacancy)) == 0


def test_an_unknown_employer_is_404(admin: TestClient, world: World) -> None:
    response = post(
        admin, {**payload(world), "employer_id": "3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10"}
    )

    assert response.status_code == 404
    assert error_code(response) == "employer_not_found"


def test_the_employer_id_is_required(admin: TestClient, world: World) -> None:
    response = post(admin, payload(world))

    assert response.status_code == 422
    assert "employer_id" in fields_of(response)


def test_the_partner_sees_and_owns_the_vacancy(
    admin: TestClient, client: TestClient, db_session: Session, world: World
) -> None:
    partner = make_company(db_session, world, "partner@example.com")
    created = post(admin, {**payload(world), "employer_id": str(partner.id)}).json()["data"]

    with TestClient(client.app, raise_server_exceptions=False) as owner:
        login_as(owner, "partner@example.com")
        listed = owner.get(EMPLOYER_VACANCIES).json()["data"]
        assert [item["id"] for item in listed] == [created["id"]]
        assert listed[0]["created_by_admin"] is True


def test_the_same_validation_applies(admin: TestClient, db_session: Session, world: World) -> None:
    partner = make_company(db_session, world, "partner@example.com")

    response = post(
        admin,
        {**payload(world, salary_min=5, salary_max=1), "employer_id": str(partner.id)},
    )

    assert response.status_code == 422
    assert "salary_max" in fields_of(response)


@pytest.mark.parametrize("role", [UserRole.EMPLOYER, UserRole.JOB_SEEKER])
def test_other_roles_are_403(
    client: TestClient, db_session: Session, world: World, role: UserRole
) -> None:
    partner = make_company(db_session, world, "partner@example.com")
    create_user(db_session, "other@example.com", role)
    login_as(client, "other@example.com")

    response = post(client, {**payload(world), "employer_id": str(partner.id)})

    assert response.status_code == 403
    assert error_code(response) == "forbidden"
    assert db_session.scalar(select(func.count()).select_from(Vacancy)) == 0


def test_anonymous_requests_are_401(client: TestClient, world: World) -> None:
    response = client.post(ADMIN_VACANCIES, json=payload(world))

    assert response.status_code == 401


def test_the_csrf_header_is_needed(admin: TestClient, db_session: Session, world: World) -> None:
    partner = make_company(db_session, world, "partner@example.com")

    response = admin.post(ADMIN_VACANCIES, json={**payload(world), "employer_id": str(partner.id)})

    assert response.status_code == 403

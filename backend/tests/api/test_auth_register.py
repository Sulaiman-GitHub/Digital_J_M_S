from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.email import FakeEmailSender
from app.models import EmailToken, EmailTokenPurpose, UserRole
from tests.api.auth_helpers import AUTH, PASSWORD, error_code, get_user, register


def test_register_creates_an_unverified_job_seeker_and_sends_a_link(
    client: TestClient, fake_email: FakeEmailSender, db_session: Session
) -> None:
    response = register(client, " Nakato.Sarah@Example.com ")

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["email"] == "Nakato.Sarah@example.com"  # domain lowercased by validation
    assert data["role"] == "job_seeker"
    assert data["status"] == "active"
    assert data["email_verified"] is False
    assert data["employer_status"] is None
    assert "password" not in response.text and "argon2" not in response.text

    message = fake_email.last_to(data["email"])
    assert message.subject == "Confirm your email address"
    assert "http://localhost:5173/verify-email?token=" in message.text_body

    user = get_user(db_session, "nakato.sarah@example.com")
    assert user.password_hash and user.password_hash.startswith("$argon2id$")
    token = db_session.scalars(select(EmailToken).where(EmailToken.user_id == user.id)).one()
    assert token.purpose is EmailTokenPurpose.VERIFY_EMAIL
    assert token.token_hash not in message.text_body  # only the hash is stored


def test_register_employer(client: TestClient, db_session: Session) -> None:
    response = register(client, "hr@ssese-foods.example.com", role="employer")

    assert response.status_code == 201
    assert get_user(db_session, "hr@ssese-foods.example.com").role is UserRole.EMPLOYER


def test_duplicate_email_in_any_case_is_refused(client: TestClient) -> None:
    assert register(client, "nakato@example.com").status_code == 201

    response = register(client, "  NAKATO@example.com")

    assert response.status_code == 409
    assert error_code(response) == "email_taken"


def test_role_escalation_to_admin_is_a_validation_error(client: TestClient) -> None:
    response = register(client, role="admin")

    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert "role" in response.json()["error"]["details"]["fields"]


def test_extra_fields_cannot_be_smuggled_in(client: TestClient) -> None:
    response = client.post(
        f"{AUTH}/register",
        json={
            "email": "nakato@example.com",
            "password": PASSWORD,
            "role": "job_seeker",
            "accept_terms": True,
            "status": "active",
            "email_verified_at": "2026-01-01T00:00:00Z",
        },
    )

    assert response.status_code == 422
    assert set(response.json()["error"]["details"]["fields"]) == {"status", "email_verified_at"}


def test_weak_and_common_passwords_are_refused(client: TestClient) -> None:
    for weak in ("short", "password123", "12345678", "nakato"):
        response = register(client, "nakato@example.com", password=weak)

        assert response.status_code == 422, weak
        assert "password" in response.json()["error"]["details"]["fields"]


def test_invalid_email_is_refused(client: TestClient) -> None:
    response = register(client, "not-an-email")

    assert response.status_code == 422
    assert "email" in response.json()["error"]["details"]["fields"]


def test_no_email_is_sent_when_registration_fails(
    client: TestClient, fake_email: FakeEmailSender
) -> None:
    register(client, password="password123")

    assert fake_email.sent == []

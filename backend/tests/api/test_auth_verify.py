from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.integrations.email import FakeEmailSender
from app.models import AuditEvent, EmailToken
from tests.api.auth_helpers import (
    AUTH,
    csrf_headers,
    error_code,
    get_user,
    register,
    register_and_login,
    token_from_email,
)

EMAIL = "nakato@example.com"


def _verify(client: TestClient, token: str):  # type: ignore[no-untyped-def]
    return client.post(f"{AUTH}/verify-email", json={"token": token})


def test_verification_link_verifies_the_email(
    client: TestClient, fake_email: FakeEmailSender, db_session: Session
) -> None:
    register(client, EMAIL)

    response = _verify(client, token_from_email(fake_email, EMAIL))

    assert response.status_code == 200
    assert response.json()["data"]["email_verified"] is True
    assert get_user(db_session).email_verified_at is not None
    assert db_session.scalars(select(AuditEvent).where(AuditEvent.action == "email_verified")).one()


def test_a_used_link_cannot_be_used_again(client: TestClient, fake_email: FakeEmailSender) -> None:
    register(client, EMAIL)
    token = token_from_email(fake_email, EMAIL)
    assert _verify(client, token).status_code == 200

    response = _verify(client, token)

    assert response.status_code == 400 and error_code(response) == "token_used"


def test_an_expired_link_is_refused(
    client: TestClient, fake_email: FakeEmailSender, db_session: Session
) -> None:
    register(client, EMAIL)
    db_session.execute(
        update(EmailToken).values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )

    response = _verify(client, token_from_email(fake_email, EMAIL))

    assert response.status_code == 400 and error_code(response) == "token_expired"
    assert get_user(db_session).email_verified_at is None


def test_an_unknown_token_is_refused(client: TestClient) -> None:
    response = _verify(client, "not-a-real-token")

    assert response.status_code == 400 and error_code(response) == "token_invalid"


def test_a_reset_token_cannot_verify_an_email(
    client: TestClient, fake_email: FakeEmailSender
) -> None:
    register(client, EMAIL)
    client.post(f"{AUTH}/forgot-password", json={"email": EMAIL})
    reset_token = token_from_email(fake_email, EMAIL)  # latest email is the reset one

    assert error_code(_verify(client, reset_token)) == "token_invalid"


def test_resend_sends_a_new_link_and_retires_the_old_one(
    client: TestClient, fake_email: FakeEmailSender
) -> None:
    register_and_login(client, EMAIL)
    old_token = token_from_email(fake_email, EMAIL)

    response = client.post(f"{AUTH}/resend-verification", headers=csrf_headers(client))

    assert response.status_code == 202
    new_token = token_from_email(fake_email, EMAIL)
    assert new_token != old_token
    assert error_code(_verify(client, old_token)) == "token_used"
    assert _verify(client, new_token).status_code == 200


def test_resend_needs_login_and_csrf(client: TestClient) -> None:
    assert client.post(f"{AUTH}/resend-verification").status_code == 401

    register_and_login(client, EMAIL)
    response = client.post(f"{AUTH}/resend-verification")

    assert response.status_code == 403 and error_code(response) == "csrf_failed"


def test_resend_when_already_verified_is_409(
    client: TestClient, fake_email: FakeEmailSender
) -> None:
    register_and_login(client, EMAIL)
    _verify(client, token_from_email(fake_email, EMAIL))
    sent_before = len(fake_email.sent)

    response = client.post(f"{AUTH}/resend-verification", headers=csrf_headers(client))

    assert response.status_code == 409 and error_code(response) == "email_already_verified"
    assert len(fake_email.sent) == sent_before

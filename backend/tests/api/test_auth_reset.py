from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.integrations.email import FakeEmailSender
from app.models import AuditEvent, EmailToken, EmailTokenPurpose, UserStatus
from tests.api.auth_helpers import (
    AUTH,
    PASSWORD,
    error_code,
    get_user,
    login,
    register,
    register_and_login,
    set_status,
    token_from_email,
)

EMAIL = "nakato@example.com"
NEW_PASSWORD = "Mbarara-Hills-77"


def _forgot(client: TestClient, email: str = EMAIL):  # type: ignore[no-untyped-def]
    return client.post(f"{AUTH}/forgot-password", json={"email": email})


def _reset(client: TestClient, token: str, password: str = NEW_PASSWORD):  # type: ignore[no-untyped-def]
    return client.post(f"{AUTH}/reset-password", json={"token": token, "new_password": password})


def test_forgot_password_answers_the_same_for_unknown_and_known_emails(
    client: TestClient, fake_email: FakeEmailSender
) -> None:
    register(client, EMAIL)
    sent_after_register = len(fake_email.sent)

    unknown = _forgot(client, "ghost@example.com")
    known = _forgot(client, EMAIL)

    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert len(fake_email.sent) == sent_after_register + 1  # only the real account got mail
    message = fake_email.last_to(EMAIL)
    assert message.subject == "Reset your password"
    assert "http://localhost:5173/reset-password?token=" in message.text_body


def test_suspended_accounts_get_no_reset_email(
    client: TestClient, fake_email: FakeEmailSender, db_session: Session
) -> None:
    register(client, EMAIL)
    set_status(db_session, EMAIL, UserStatus.SUSPENDED)
    sent_before = len(fake_email.sent)

    assert _forgot(client).status_code == 202
    assert len(fake_email.sent) == sent_before


def test_reset_changes_the_password(
    client: TestClient, fake_email: FakeEmailSender, db_session: Session
) -> None:
    register(client, EMAIL)
    _forgot(client)

    response = _reset(client, token_from_email(fake_email, EMAIL))

    assert response.status_code == 200
    assert login(client, EMAIL, PASSWORD).status_code == 401
    assert login(client, EMAIL, NEW_PASSWORD).status_code == 200
    assert db_session.scalars(select(AuditEvent).where(AuditEvent.action == "password_reset")).one()
    # The link proved the user can read this inbox.
    assert get_user(db_session).email_verified_at is not None


def test_reset_revokes_every_session_of_that_user(
    client: TestClient, fake_email: FakeEmailSender
) -> None:
    register_and_login(client, EMAIL)
    with TestClient(client.app, raise_server_exceptions=False) as phone:
        assert login(phone, EMAIL).status_code == 200
        _forgot(client)

        assert _reset(client, token_from_email(fake_email, EMAIL)).status_code == 200

        assert client.get(f"{AUTH}/me").status_code == 401
        assert phone.get(f"{AUTH}/me").status_code == 401


def test_a_reset_link_works_only_once(client: TestClient, fake_email: FakeEmailSender) -> None:
    register(client, EMAIL)
    _forgot(client)
    token = token_from_email(fake_email, EMAIL)
    assert _reset(client, token).status_code == 200

    response = _reset(client, token, "Another-Strong-Pass-1")

    assert response.status_code == 400 and error_code(response) == "token_used"


def test_an_expired_reset_link_is_refused(
    client: TestClient, fake_email: FakeEmailSender, db_session: Session
) -> None:
    register(client, EMAIL)
    _forgot(client)
    db_session.execute(
        update(EmailToken)
        .where(EmailToken.purpose == EmailTokenPurpose.RESET_PASSWORD)
        .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )

    response = _reset(client, token_from_email(fake_email, EMAIL))

    assert response.status_code == 400 and error_code(response) == "token_expired"
    assert login(client, EMAIL, PASSWORD).status_code == 200  # password unchanged


def test_requesting_a_new_link_retires_the_previous_one(
    client: TestClient, fake_email: FakeEmailSender
) -> None:
    register(client, EMAIL)
    _forgot(client)
    first = token_from_email(fake_email, EMAIL)
    _forgot(client)
    second = token_from_email(fake_email, EMAIL)

    assert error_code(_reset(client, first)) == "token_used"
    assert _reset(client, second).status_code == 200


def test_a_weak_new_password_is_refused_and_the_link_stays_usable(
    client: TestClient, fake_email: FakeEmailSender
) -> None:
    register(client, EMAIL)
    _forgot(client)
    token = token_from_email(fake_email, EMAIL)

    weak = _reset(client, token, "password123")

    assert weak.status_code == 422
    assert "new_password" in weak.json()["error"]["details"]["fields"]
    assert _reset(client, token).status_code == 200


def test_a_verification_token_cannot_reset_a_password(
    client: TestClient, fake_email: FakeEmailSender
) -> None:
    register(client, EMAIL)

    response = _reset(client, token_from_email(fake_email, EMAIL))

    assert response.status_code == 400 and error_code(response) == "token_invalid"

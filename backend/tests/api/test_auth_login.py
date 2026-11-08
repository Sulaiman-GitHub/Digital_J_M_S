from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api import cookies
from app.core.rate_limit import limiter
from app.core.security import hash_token
from app.models import AuditEvent, AuthSession, UserStatus
from tests.api.auth_helpers import (
    PASSWORD,
    error_code,
    get_user,
    login,
    register,
    set_status,
)


def _set_cookie_headers(response) -> dict[str, str]:  # type: ignore[no-untyped-def]
    return {h.split("=", 1)[0]: h for h in response.headers.get_list("set-cookie")}


def test_login_sets_httponly_session_and_readable_csrf_cookies(
    client: TestClient, db_session: Session
) -> None:
    register(client)

    response = login(client)

    assert response.status_code == 200
    assert response.json()["data"]["email"] == "nakato@example.com"
    set_cookies = _set_cookie_headers(response)
    session_cookie, csrf_cookie = set_cookies["djm_session"], set_cookies["djm_csrf"]
    assert "HttpOnly" in session_cookie and "samesite=lax" in session_cookie.lower()
    assert "HttpOnly" not in csrf_cookie and "samesite=lax" in csrf_cookie.lower()
    assert "Max-Age=" in session_cookie
    assert "Secure" not in session_cookie  # development; see the production test below

    # The database holds only hashes of the tokens.
    raw = client.cookies.get("djm_session")
    session = db_session.scalars(select(AuthSession)).one()
    assert session.token_hash == hash_token(raw) and session.token_hash != raw
    assert session.csrf_token_hash == hash_token(client.cookies.get("djm_csrf"))
    assert get_user(db_session).last_login_at is not None


def test_cookies_are_secure_in_production(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    register(client)
    monkeypatch.setattr(cookies, "get_settings", lambda: SimpleNamespace(is_production=True))

    response = login(client)

    for header in _set_cookie_headers(response).values():
        assert "Secure" in header


def test_login_email_is_case_and_space_insensitive(client: TestClient) -> None:
    register(client, "nakato@example.com")

    assert login(client, "  NAKATO@Example.com ").status_code == 200


def test_unknown_email_and_wrong_password_get_the_identical_error(client: TestClient) -> None:
    register(client)

    unknown = login(client, "nobody@example.com")
    wrong = login(client, "nakato@example.com", "Wrong-Password-99")

    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()
    assert error_code(wrong) == "invalid_credentials"
    assert "djm_session" not in client.cookies


def test_failed_logins_are_audited_without_the_password(
    client: TestClient, db_session: Session
) -> None:
    register(client)
    login(client, "nakato@example.com", "Wrong-Password-99")
    login(client, "ghost@example.com", "Wrong-Password-99")

    events = db_session.scalars(select(AuditEvent).where(AuditEvent.action == "login_failed")).all()
    reasons = sorted((e.event_metadata["email"], e.event_metadata["reason"]) for e in events)
    assert reasons == [
        ("ghost@example.com", "unknown_email"),
        ("nakato@example.com", "wrong_password"),
    ]
    assert all("Wrong-Password-99" not in str(e.event_metadata) for e in events)


def test_suspended_user_is_blocked_after_a_correct_password(
    client: TestClient, db_session: Session
) -> None:
    register(client)
    set_status(db_session, "nakato@example.com", UserStatus.SUSPENDED)

    correct = login(client)
    wrong = login(client, password="Wrong-Password-99")

    assert correct.status_code == 403 and error_code(correct) == "account_suspended"
    assert wrong.status_code == 401  # a wrong password reveals nothing about the account
    assert "djm_session" not in client.cookies


def test_deleted_user_cannot_log_in(client: TestClient, db_session: Session) -> None:
    register(client)
    set_status(db_session, "nakato@example.com", UserStatus.DELETED)

    response = login(client)

    assert response.status_code == 401 and error_code(response) == "invalid_credentials"


def test_lockout_after_five_failures_even_with_the_right_password(client: TestClient) -> None:
    limiter.enabled = False  # isolate the per-email lockout from the per-IP rate limit
    register(client)
    for _ in range(5):
        assert login(client, password="Wrong-Password-99").status_code == 401

    response = login(client)

    assert response.status_code == 429
    assert error_code(response) == "too_many_attempts"


def test_lockout_also_applies_to_unknown_emails(client: TestClient) -> None:
    limiter.enabled = False
    for _ in range(5):
        login(client, "ghost@example.com", "Wrong-Password-99")

    assert error_code(login(client, "ghost@example.com", "Wrong-Password-99")) == (
        "too_many_attempts"
    )


def test_failures_before_a_successful_login_do_not_count(client: TestClient) -> None:
    limiter.enabled = False
    register(client)
    for _ in range(4):
        login(client, password="Wrong-Password-99")
    assert login(client).status_code == 200

    assert login(client, password="Wrong-Password-99").status_code == 401
    assert login(client).status_code == 200


def test_missing_fields_are_a_validation_error(client: TestClient) -> None:
    response = client.post("/api/v1/auth/login", json={"email": "nakato@example.com"})

    assert response.status_code == 422
    assert "password" in response.json()["error"]["details"]["fields"]


def test_login_password_is_never_echoed(client: TestClient) -> None:
    register(client)

    response = login(client, password=PASSWORD)

    assert PASSWORD not in response.text

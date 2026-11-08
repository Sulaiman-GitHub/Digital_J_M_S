"""Current user, CSRF, logout, session expiry and the role / verified-email dependencies."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import require_csrf, require_role, require_verified_email
from app.models import AuthSession, UserRole, UserStatus
from tests.api.auth_helpers import (
    AUTH,
    csrf_headers,
    error_code,
    get_user,
    register_and_login,
    set_status,
)


@pytest.fixture
def second_client(client: TestClient) -> Iterator[TestClient]:
    """Another browser against the same app and test database."""
    with TestClient(client.app, raise_server_exceptions=False) as other:
        yield other


# ---------- /me ----------


def test_me_returns_the_logged_in_user(client: TestClient) -> None:
    register_and_login(client)

    response = client.get(f"{AUTH}/me")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["email"] == "nakato@example.com"
    assert data["role"] == "job_seeker"
    assert data["email_verified"] is False


def test_me_without_a_session_is_401(client: TestClient) -> None:
    response = client.get(f"{AUTH}/me")

    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"


def test_a_forged_session_cookie_is_401(client: TestClient) -> None:
    client.cookies.set("djm_session", "made-up-token")

    assert client.get(f"{AUTH}/me").status_code == 401


def test_an_expired_session_is_401(client: TestClient, db_session: Session) -> None:
    register_and_login(client)
    db_session.execute(
        update(AuthSession).values(expires_at=datetime.now(UTC) - timedelta(minutes=1))
    )

    assert client.get(f"{AUTH}/me").status_code == 401


def test_suspending_a_user_ends_their_access_immediately(
    client: TestClient, db_session: Session
) -> None:
    register_and_login(client)
    assert client.get(f"{AUTH}/me").status_code == 200

    set_status(db_session, "nakato@example.com", UserStatus.SUSPENDED)

    assert client.get(f"{AUTH}/me").status_code == 401


# ---------- CSRF and logout ----------


def test_logout_without_csrf_header_is_refused(client: TestClient) -> None:
    register_and_login(client)

    response = client.post(f"{AUTH}/logout")

    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"
    assert client.get(f"{AUTH}/me").status_code == 200  # still logged in


def test_logout_with_a_wrong_csrf_header_is_refused(client: TestClient) -> None:
    register_and_login(client)

    response = client.post(f"{AUTH}/logout", headers={"X-CSRF-Token": "guess"})

    assert response.status_code == 403 and error_code(response) == "csrf_failed"


def test_csrf_token_from_another_session_is_refused(
    client: TestClient, second_client: TestClient
) -> None:
    register_and_login(client, "nakato@example.com")
    register_and_login(second_client, "okello@example.com")
    other_token = second_client.cookies.get("djm_csrf")
    # Header and cookie agree with each other, but not with this session.
    client.cookies.set("djm_csrf", other_token)

    response = client.post(f"{AUTH}/logout", headers={"X-CSRF-Token": other_token})

    assert response.status_code == 403 and error_code(response) == "csrf_failed"


def test_logout_revokes_the_session_and_clears_cookies(
    client: TestClient, db_session: Session
) -> None:
    register_and_login(client)
    stolen_cookie = client.cookies.get("djm_session")

    response = client.post(f"{AUTH}/logout", headers=csrf_headers(client))

    assert response.status_code == 204
    assert "djm_session" not in client.cookies
    assert db_session.scalars(select(AuthSession)).one().revoked_at is not None
    # Replaying the old cookie does not work either.
    client.cookies.set("djm_session", stolen_cookie)
    assert client.get(f"{AUTH}/me").status_code == 401


def test_logout_needs_a_session(client: TestClient) -> None:
    assert client.post(f"{AUTH}/logout", headers={"X-CSRF-Token": "x"}).status_code == 401


def test_logging_out_one_device_keeps_the_other(
    client: TestClient, second_client: TestClient
) -> None:
    register_and_login(client)
    from tests.api.auth_helpers import login

    assert login(second_client).status_code == 200

    client.post(f"{AUTH}/logout", headers=csrf_headers(client))

    assert second_client.get(f"{AUTH}/me").status_code == 200


# ---------- require_role and require_verified_email ----------


@pytest.fixture
def guarded_routes(client: TestClient) -> TestClient:
    """Test-only routes that use the shared dependencies."""
    app = client.app

    @app.get("/api/v1/_test/admin-only", dependencies=[Depends(require_role(UserRole.ADMIN))])
    def admin_only() -> dict[str, str]:
        return {"data": "admin"}

    @app.get(
        "/api/v1/_test/employer-or-admin",
        dependencies=[Depends(require_role(UserRole.EMPLOYER, UserRole.ADMIN))],
    )
    def employer_or_admin() -> dict[str, str]:
        return {"data": "ok"}

    @app.post(
        "/api/v1/_test/verified-action",
        dependencies=[Depends(require_csrf), Depends(require_verified_email)],
    )
    def verified_action() -> dict[str, str]:
        return {"data": "done"}

    return client


def test_require_role_returns_403_for_the_wrong_role(guarded_routes: TestClient) -> None:
    register_and_login(guarded_routes, role="job_seeker")

    response = guarded_routes.get("/api/v1/_test/admin-only")

    assert response.status_code == 403 and error_code(response) == "forbidden"


def test_require_role_allows_a_listed_role(guarded_routes: TestClient) -> None:
    register_and_login(guarded_routes, "hr@ssese-foods.example.com", role="employer")

    assert guarded_routes.get("/api/v1/_test/employer-or-admin").status_code == 200
    assert guarded_routes.get("/api/v1/_test/admin-only").status_code == 403


def test_require_role_needs_a_session(guarded_routes: TestClient) -> None:
    assert guarded_routes.get("/api/v1/_test/admin-only").status_code == 401


def test_require_verified_email_blocks_unverified_users(
    guarded_routes: TestClient, db_session: Session
) -> None:
    register_and_login(guarded_routes)

    blocked = guarded_routes.post(
        "/api/v1/_test/verified-action", headers=csrf_headers(guarded_routes)
    )
    assert blocked.status_code == 403 and error_code(blocked) == "email_not_verified"

    get_user(db_session).email_verified_at = datetime.now(UTC)
    db_session.flush()

    allowed = guarded_routes.post(
        "/api/v1/_test/verified-action", headers=csrf_headers(guarded_routes)
    )
    assert allowed.status_code == 200

"""Auth cookies."""

from datetime import UTC, datetime

from fastapi import Response

from app.core.config import get_settings

SESSION_COOKIE = "djm_session"
CSRF_COOKIE = "djm_csrf"
CSRF_HEADER = "X-CSRF-Token"


def set_auth_cookies(
    response: Response, session_token: str, csrf_token: str, expires_at: datetime
) -> None:
    secure = get_settings().is_production
    max_age = max(int((expires_at - datetime.now(UTC)).total_seconds()), 0)
    # HttpOnly: page scripts cannot read the session token.
    response.set_cookie(
        SESSION_COOKIE,
        session_token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    # Readable on purpose: the frontend copies it into the X-CSRF-Token header.
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite="lax",
        path="/",
    )


def clear_auth_cookies(response: Response) -> None:
    secure = get_settings().is_production
    for name, httponly in ((SESSION_COOKIE, True), (CSRF_COOKIE, False)):
        response.delete_cookie(name, path="/", secure=secure, httponly=httponly, samesite="lax")

"""Shared route dependencies: database session, current user, roles, CSRF, email sender."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.api.cookies import CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE
from app.core.errors import AppError
from app.core.security import hash_token, tokens_match
from app.db.session import get_db
from app.integrations.email import EmailSender, get_email_sender
from app.integrations.storage import FileStorage, get_file_storage
from app.models import AuthSession, Employer, User, UserRole
from app.services import auth as auth_service
from app.services import employers as employer_service

# scope="function": the commit/rollback in get_db runs when the route returns, before the
# response is sent. Dependencies that use DbSession must also be function-scoped.
DbSession = Annotated[Session, Depends(get_db, scope="function")]

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


@dataclass(frozen=True)
class AuthContext:
    session: AuthSession
    user: User


def get_auth_context(request: Request, db: DbSession) -> AuthContext:
    """The caller's live session (cookie) and active user, or 401."""
    raw = request.cookies.get(SESSION_COOKIE)
    found = auth_service.get_active_session(db, raw) if raw else None
    if found is None:
        raise AppError("not_authenticated", "Please log in to continue.", status=401)
    return AuthContext(*found)


CurrentAuth = Annotated[AuthContext, Depends(get_auth_context)]


def get_current_user(auth: CurrentAuth) -> User:
    return auth.user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_csrf(request: Request, auth: CurrentAuth) -> None:
    """Unsafe methods need X-CSRF-Token equal to the djm_csrf cookie and to this session's token."""
    if request.method in SAFE_METHODS:
        return
    header = request.headers.get(CSRF_HEADER)
    cookie = request.cookies.get(CSRF_COOKIE)
    if (
        not header
        or not cookie
        or not tokens_match(header, cookie)
        or not tokens_match(hash_token(header), auth.session.csrf_token_hash)
    ):
        raise AppError(
            "csrf_failed", "Your session check failed. Refresh the page and try again.", 403
        )


def require_role(*roles: UserRole) -> Callable[[User], User]:
    """Dependency factory: 403 unless the current user has one of the roles."""

    def dependency(user: CurrentUser) -> User:
        if user.role not in roles:
            raise AppError("forbidden", "You do not have permission to do this.", status=403)
        return user

    return dependency


def require_verified_email(user: CurrentUser) -> User:
    """Unverified users can log in but cannot apply, submit or publish."""
    if user.email_verified_at is None:
        raise AppError("email_not_verified", "Please verify your email address first.", status=403)
    return user


def require_publishing_employer(
    user: Annotated[User, Depends(require_role(UserRole.EMPLOYER))], db: DbSession
) -> Employer:
    """The employer's company, only if it is approved. Use this on every route
    that publishes: unverified, pending, rejected and suspended employers get 403
    employer_not_verified, whatever the screen shows."""
    employer = employer_service.get_employer_for_user(db, user)
    if employer is None or not employer_service.can_publish(employer):
        raise AppError(
            "employer_not_verified",
            "Your company must be verified before you can publish.",
            status=403,
        )
    return employer


PublishingEmployer = Annotated[Employer, Depends(require_publishing_employer, scope="function")]


def email_sender() -> EmailSender:
    return get_email_sender()


EmailSenderDep = Annotated[EmailSender, Depends(email_sender)]


def client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def file_storage() -> FileStorage:
    return get_file_storage()


FileStorageDep = Annotated[FileStorage, Depends(file_storage)]

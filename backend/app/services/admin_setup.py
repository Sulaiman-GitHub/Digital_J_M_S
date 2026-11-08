"""Creating the first admin. Registration can never create admins."""

import enum
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, normalise_email, password_problem
from app.models import User, UserRole, UserStatus
from app.services.audit import record_event

# Admins can approve employers and see everything, so their passwords must be longer.
ADMIN_PASSWORD_MIN_LENGTH = 12


class AdminSetupResult(enum.StrEnum):
    CREATED = "created"
    PROMOTED = "promoted"
    ALREADY_ADMIN = "already_admin"


class AdminSetupError(Exception):
    """A refusal with a message that is safe to print."""


def admin_password_problem(password: str, email: str) -> str | None:
    if len(password) < ADMIN_PASSWORD_MIN_LENGTH:
        return f"Admin passwords need at least {ADMIN_PASSWORD_MIN_LENGTH} characters."
    return password_problem(password, email)


def find_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email_normalized == normalise_email(email)))


def create_or_promote_admin(
    db: Session, email: str, password: str | None, *, promote: bool = False
) -> AdminSetupResult:
    """Make `email` an active, verified admin. Safe to run more than once.

    - no account: create one (needs `password`)
    - already an admin: change nothing, including the password
    - job seeker or employer: refuse unless `promote`; promoting keeps their password
    - suspended or deleted: refuse; that needs a human decision
    """
    now = datetime.now(UTC)
    user = find_user(db, email)

    if user is None:
        if password is None:
            raise AdminSetupError("A password is needed to create a new admin.")
        if problem := admin_password_problem(password, email):
            raise AdminSetupError(problem)
        user = User(
            email=email.strip(),
            email_normalized=normalise_email(email),
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
            email_verified_at=now,
        )
        db.add(user)
        db.flush()
        record_event(db, "admin_created", actor_user_id=None, entity_type="user", entity_id=user.id)
        db.flush()
        return AdminSetupResult.CREATED

    if user.status is not UserStatus.ACTIVE:
        raise AdminSetupError(
            f"The account for {user.email} is {user.status.value}. "
            "Resolve that by hand before making it an admin."
        )
    if user.role is UserRole.ADMIN:
        return AdminSetupResult.ALREADY_ADMIN
    if not promote:
        raise AdminSetupError(
            f"{user.email} already belongs to a {user.role.value.replace('_', ' ')} account. "
            "Run again with --promote to make that account an admin."
        )

    previous_role = user.role.value
    user.role = UserRole.ADMIN
    if user.email_verified_at is None:
        user.email_verified_at = now
    record_event(
        db,
        "admin_promoted",
        actor_user_id=None,
        entity_type="user",
        entity_id=user.id,
        metadata={"previous_role": previous_role},
    )
    db.flush()
    return AdminSetupResult.PROMOTED

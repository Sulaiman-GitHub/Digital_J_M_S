import enum
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedUUIDMixin, str_enum


class UserRole(enum.StrEnum):
    JOB_SEEKER = "job_seeker"
    EMPLOYER = "employer"
    ADMIN = "admin"


class UserStatus(enum.StrEnum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DELETED = "deleted"


class User(TimestampedUUIDMixin, Base):
    """A person who can sign in. Role and status are decided by the server.

    Users are not hard-deleted in normal use: closing an account sets status=deleted and
    deleted_at. If a row is ever hard-deleted (data erasure), sessions, email tokens and auth
    identities are removed with it and audit events keep the row with actor_user_id = NULL.
    """

    __tablename__ = "users"
    __table_args__ = (
        # Services fill email_normalized with core.security.normalise_email(); the database
        # refuses anything that is not already trimmed and lowercase.
        CheckConstraint(
            "email_normalized = lower(btrim(email_normalized))",
            name="email_normalized_is_normalized",
        ),
    )

    email: Mapped[str] = mapped_column(String(254), nullable=False)
    email_normalized: Mapped[str] = mapped_column(String(254), nullable=False, unique=True)
    # Nullable so a future social-login-only account (release 2) needs no password.
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(str_enum(UserRole, "user_role"), nullable=False)
    status: Mapped[UserStatus] = mapped_column(
        str_enum(UserStatus, "user_status"),
        nullable=False,
        default=UserStatus.ACTIVE,
        server_default=UserStatus.ACTIVE.value,
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

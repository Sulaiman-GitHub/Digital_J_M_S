"""Job applications and their status history."""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedUUIDMixin, str_enum


class ApplicationStatus(enum.StrEnum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    SHORTLISTED = "shortlisted"
    INTERVIEW = "interview"
    OFFERED = "offered"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class Application(TimestampedUUIDMixin, Base):
    """One person's application to one vacancy.

    The CV and the profile are copied when the person applies: cv_storage_key is the application's
    own file and profile_snapshot is a JSON copy, so later changes to the profile or the CV never
    change what the employer sees. A person can apply to a vacancy only once, even after
    withdrawing (unique constraint). status changes only through services/applications.py.

    If a user row is ever hard-deleted its applications go with it, but the copied CV files would
    stay on disk: whoever deletes a user must delete these files first.
    """

    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("vacancy_id", "applicant_user_id"),
        CheckConstraint("char_length(cover_note) <= 2000", name="cover_note_length"),
        CheckConstraint("cv_size_bytes > 0", name="cv_size_positive"),
        Index("ix_applications_vacancy_id_status", "vacancy_id", "status"),
    )

    vacancy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), nullable=False
    )
    applicant_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        str_enum(ApplicationStatus, "application_status"),
        nullable=False,
        default=ApplicationStatus.SUBMITTED,
        server_default=ApplicationStatus.SUBMITTED.value,
    )
    cover_note: Mapped[str | None] = mapped_column(Text)
    # Random 32-character key of the application's own copy of the CV. Never sent to clients.
    cv_storage_key: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    cv_original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    cv_content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    cv_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    profile_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ApplicationStatusEvent(Base):
    """Append-only history of an application's status. Rows are never updated or deleted by the
    app. The first row has from_status NULL."""

    __tablename__ = "application_status_history"
    __table_args__ = (
        Index(
            "ix_application_status_history_application_id_created_at",
            "application_id",
            "created_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[ApplicationStatus | None] = mapped_column(
        str_enum(ApplicationStatus, "from_status")
    )
    to_status: Mapped[ApplicationStatus] = mapped_column(
        str_enum(ApplicationStatus, "to_status"), nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    note: Mapped[str | None] = mapped_column(Text)
    # clock_timestamp(), not now(): two changes in one transaction must not tie.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.clock_timestamp()
    )

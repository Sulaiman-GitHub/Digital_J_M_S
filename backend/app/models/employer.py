"""Employers and their verification history."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedUUIDMixin, str_enum


class VerificationStatus(enum.StrEnum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class Employer(TimestampedUUIDMixin, Base):
    """The company profile of one employer user. Only an approved employer may publish.

    verification_status is changed only through services/employers.change_status, which checks
    the transition table and writes a history row and an audit event.
    """

    __tablename__ = "employers"

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    registration_number: Mapped[str | None] = mapped_column(String(50))
    website: Mapped[str | None] = mapped_column(String(300))
    contact_phone: Mapped[str | None] = mapped_column(String(13))
    district_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("districts.id", ondelete="RESTRICT"), nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        str_enum(VerificationStatus, "verification_status"),
        nullable=False,
        default=VerificationStatus.DRAFT,
        server_default=VerificationStatus.DRAFT.value,
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EmployerVerificationEvent(Base):
    """Append-only history of status changes. Rows are never updated or deleted by the app."""

    __tablename__ = "employer_verification_events"
    __table_args__ = (
        # Rejecting or suspending must always say why.
        CheckConstraint(
            "to_status NOT IN ('rejected', 'suspended') "
            "OR (reason IS NOT NULL AND btrim(reason) <> '')",
            name="reason_required",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    employer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[VerificationStatus] = mapped_column(
        str_enum(VerificationStatus, "from_status"), nullable=False
    )
    to_status: Mapped[VerificationStatus] = mapped_column(
        str_enum(VerificationStatus, "to_status"), nullable=False
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    reason: Mapped[str | None] = mapped_column(Text)
    # clock_timestamp(), not now(): now() is the start of the transaction, so two changes made in
    # one transaction would tie and the history could not be put in order.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.clock_timestamp()
    )

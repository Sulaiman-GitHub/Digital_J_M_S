"""Recorded consents: what a user agreed to, to which version, and when."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, str_enum


class ConsentType(enum.StrEnum):
    TERMS = "terms"
    PRIVACY = "privacy"
    CV_SHARING_WITH_EMPLOYERS = "cv_sharing_with_employers"


class Consent(Base):
    """One grant of one consent. Withdrawing sets revoked_at; rows are never deleted, so there is
    always a record of what was agreed and when. A user has at most one active (not revoked) row
    per consent type. Granting again for a newer policy version revokes the old row first.
    """

    __tablename__ = "consents"
    __table_args__ = (
        Index(
            "uq_consents_user_id_consent_type_active",
            "user_id",
            "consent_type",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        server_default=func.gen_random_uuid(),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    consent_type: Mapped[ConsentType] = mapped_column(
        str_enum(ConsentType, "consent_type"), nullable=False
    )
    policy_version: Mapped[str] = mapped_column(String(50), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

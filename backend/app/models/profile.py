"""Job seeker profiles. Private: only the owner ever reads them in the MVP."""

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedUUIDMixin, str_enum


class StudyStatus(enum.StrEnum):
    STUDYING = "studying"
    COMPLETED = "completed"


class SeekerProfile(TimestampedUUIDMixin, Base):
    """One profile per job seeker. Reference rows are never deleted, so those links RESTRICT."""

    __tablename__ = "seeker_profiles"
    __table_args__ = (
        # Pick an institution from the list OR type its name, never both and never neither.
        CheckConstraint(
            "num_nonnulls(institution_id, institution_other_name) = 1",
            name="institution_or_other",
        ),
        CheckConstraint(
            "num_nonnulls(field_of_study_id, field_of_study_other) <= 1",
            name="field_of_study_or_other",
        ),
        # studying -> only an expected completion date; completed -> only a graduation date.
        CheckConstraint(
            "(study_status = 'studying' AND graduation_date IS NULL) OR "
            "(study_status = 'completed' AND expected_completion_date IS NULL)",
            name="study_status_dates",
        ),
        CheckConstraint(
            "institution_other_name IS NULL OR btrim(institution_other_name) <> ''",
            name="institution_other_not_blank",
        ),
        CheckConstraint(
            "field_of_study_other IS NULL OR btrim(field_of_study_other) <> ''",
            name="field_of_study_other_not_blank",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    # Stored as +256XXXXXXXXX (13 characters).
    phone: Mapped[str | None] = mapped_column(String(13))
    # Optional and private: never sent to employers (the application snapshot lists its fields).
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    institution_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("institutions.id", ondelete="RESTRICT"), index=True
    )
    institution_other_name: Mapped[str | None] = mapped_column(String(200))
    qualification_level_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("qualification_levels.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    field_of_study_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("fields_of_study.id", ondelete="RESTRICT")
    )
    field_of_study_other: Mapped[str | None] = mapped_column(String(150))
    study_status: Mapped[StudyStatus] = mapped_column(
        str_enum(StudyStatus, "study_status"), nullable=False
    )
    expected_completion_date: Mapped[date | None] = mapped_column(Date)
    graduation_date: Mapped[date | None] = mapped_column(Date)
    district_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("districts.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    summary: Mapped[str | None] = mapped_column(String(1000))
    # Reserved for release 2 employer search. Never set from the API; always false in the MVP.
    is_discoverable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )


class ProfileSkill(Base):
    """A skill on a profile. Key: (profile_id, skill_id). The API enforces the 30-skill limit."""

    __tablename__ = "profile_skills"

    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("seeker_profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    skill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("skills.id", ondelete="RESTRICT"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class ProfileExperience(TimestampedUUIDMixin, Base):
    """A job or role. The 10-per-profile limit is enforced by the API."""

    __tablename__ = "profile_experiences"
    __table_args__ = (
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="end_not_before_start"),
    )

    profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("seeker_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(150), nullable=False)
    organisation: Mapped[str] = mapped_column(String(150), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)  # empty means "current"
    description: Mapped[str | None] = mapped_column(String(1000))

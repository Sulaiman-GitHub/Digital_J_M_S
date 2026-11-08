"""Reference data: clean lookup tables instead of free text.

Seeded from scripts/data/*.csv by scripts/seed_reference.py. Rows are never deleted; an admin
switches `is_active` off to hide one, and re-seeding does not switch it back on.
"""

import enum
import uuid

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedUUIDMixin, str_enum


class InstitutionType(enum.StrEnum):
    UNIVERSITY = "university"
    COLLEGE = "college"
    TECHNICAL_INSTITUTE = "technical_institute"
    VOCATIONAL = "vocational"
    OTHER = "other"


def _active_column() -> Mapped[bool]:
    return mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))


class District(TimestampedUUIDMixin, Base):
    __tablename__ = "districts"

    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    region: Mapped[str] = mapped_column(String(50), nullable=False)


class QualificationLevel(TimestampedUUIDMixin, Base):
    """Ordered: 1 certificate ... 6 doctorate. "Ongoing" is handled by study_status."""

    __tablename__ = "qualification_levels"
    __table_args__ = (CheckConstraint("rank > 0", name="rank_positive"),)

    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    rank: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)


class Institution(TimestampedUUIDMixin, Base):
    """Universities, colleges and institutes. "Other" is not a row: profiles store the name."""

    __tablename__ = "institutions"

    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    institution_type: Mapped[InstitutionType] = mapped_column(
        str_enum(InstitutionType, "institution_type"), nullable=False
    )
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("districts.id", ondelete="SET NULL"), index=True
    )
    is_active: Mapped[bool] = _active_column()


class FieldOfStudy(TimestampedUUIDMixin, Base):
    __tablename__ = "fields_of_study"

    name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    is_active: Mapped[bool] = _active_column()


class Skill(TimestampedUUIDMixin, Base):
    __tablename__ = "skills"
    __table_args__ = (
        # Filled with services.reference.normalise_name(); the database refuses anything else
        # that is not trimmed and lowercase, like users.email_normalized.
        CheckConstraint(
            "name_normalized = lower(btrim(name_normalized))",
            name="name_normalized_is_normalized",
        ),
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_normalized: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    is_active: Mapped[bool] = _active_column()

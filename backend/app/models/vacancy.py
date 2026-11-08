"""Vacancies and their requirements."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedUUIDMixin, str_enum


class EmploymentType(enum.StrEnum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERNSHIP = "internship"
    TEMPORARY = "temporary"


class WorkArrangement(enum.StrEnum):
    ONSITE = "onsite"
    REMOTE = "remote"
    HYBRID = "hybrid"


class ApplicationMethod(enum.StrEnum):
    INTERNAL = "internal"
    EXTERNAL = "external"


class VacancyStatus(enum.StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class RequirementKind(enum.StrEnum):
    SKILL = "skill"
    QUALIFICATION = "qualification"
    CERTIFICATION = "certification"
    OTHER = "other"


class Vacancy(TimestampedUUIDMixin, Base):
    """A job. Draft vacancies may be incomplete; a published one always is (database CHECK).

    "Expired" is not stored: a vacancy is live when status is published and
    expires_at is in the future. Everything public uses that one predicate (services/vacancies).
    """

    __tablename__ = "vacancies"
    __table_args__ = (
        CheckConstraint("min_experience_years BETWEEN 0 AND 50", name="experience_range"),
        CheckConstraint("salary_min IS NULL OR salary_min >= 0", name="salary_min_not_negative"),
        CheckConstraint("salary_max IS NULL OR salary_max >= 0", name="salary_max_not_negative"),
        CheckConstraint(
            "salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min",
            name="salary_order",
        ),
        # An external link is always https; an internal vacancy has no link.
        CheckConstraint(
            "external_url IS NULL OR external_url LIKE 'https://%'", name="external_url_https"
        ),
        CheckConstraint(
            "application_method <> 'internal' OR external_url IS NULL", name="internal_no_url"
        ),
        # A published vacancy is complete and expires within 90 days of publishing.
        CheckConstraint(
            "status <> 'published' OR ("
            "description IS NOT NULL AND employment_type IS NOT NULL "
            "AND work_arrangement IS NOT NULL AND expires_at IS NOT NULL "
            "AND published_at IS NOT NULL "
            "AND (work_arrangement = 'remote' OR district_id IS NOT NULL) "
            "AND (application_method <> 'external' OR external_url IS NOT NULL) "
            "AND expires_at <= published_at + interval '90 days')",
            name="published_is_complete",
        ),
        Index("ix_vacancies_status_expires_at", "status", "expires_at"),
        Index("ix_vacancies_search_vector", "search_vector", postgresql_using="gin"),
        # The public list is "newest first among published": this lets it read just the first page.
        Index(
            "ix_vacancies_newest_published",
            text("published_at DESC"),
            "id",
            postgresql_where=text("status = 'published'"),
        ),
    )

    employer_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("employers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    employment_type: Mapped[EmploymentType | None] = mapped_column(
        str_enum(EmploymentType, "employment_type"), index=True
    )
    work_arrangement: Mapped[WorkArrangement | None] = mapped_column(
        str_enum(WorkArrangement, "work_arrangement")
    )
    district_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("districts.id", ondelete="RESTRICT"), index=True
    )
    min_qualification_level_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("qualification_levels.id", ondelete="RESTRICT"), index=True
    )
    min_experience_years: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    salary_min: Mapped[int | None] = mapped_column(BigInteger)  # integer UGX
    salary_max: Mapped[int | None] = mapped_column(BigInteger)
    show_salary: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    application_method: Mapped[ApplicationMethod] = mapped_column(
        str_enum(ApplicationMethod, "application_method"),
        nullable=False,
        default=ApplicationMethod.INTERNAL,
        server_default=ApplicationMethod.INTERNAL.value,
    )
    external_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[VacancyStatus] = mapped_column(
        str_enum(VacancyStatus, "vacancy_status"),
        nullable=False,
        default=VacancyStatus.DRAFT,
        server_default=VacancyStatus.DRAFT.value,
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_admin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Generated by the database from the title (weight A) and description (weight B).
    search_vector: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('english', coalesce(title, '')), 'A') || "
            "setweight(to_tsvector('english', coalesce(description, '')), 'B')",
            persisted=True,
        ),
    )


class VacancyRequirement(Base):
    """One requirement of a vacancy. is_mandatory is what release 2 matching decides on."""

    __tablename__ = "vacancy_requirements"
    __table_args__ = (
        CheckConstraint("kind <> 'skill' OR skill_id IS NOT NULL", name="skill_has_skill_id"),
        CheckConstraint("kind = 'skill' OR skill_id IS NULL", name="only_skills_have_skill_id"),
        CheckConstraint("btrim(label) <> ''", name="label_not_blank"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid()
    )
    vacancy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[RequirementKind] = mapped_column(
        str_enum(RequirementKind, "requirement_kind"), nullable=False
    )
    skill_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("skills.id", ondelete="RESTRICT"))
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

"""Vacancy request and response schemas.

Formats and lengths are checked here. Rules that compare several fields, or look at the database
or the clock (salary order, publishing rules, unknown ids), live in services/vacancies.py and are
reported together as field errors.
"""

import uuid
from datetime import datetime
from urllib.parse import urlsplit

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator

from app.models import (
    ApplicationMethod,
    EmploymentType,
    RequirementKind,
    Vacancy,
    VacancyRequirement,
    VacancyStatus,
    WorkArrangement,
)
from app.schemas.profile import _error, clean_block, clean_line

TITLE_MIN, TITLE_MAX = 3, 200
DESCRIPTION_MAX = 10_000
LABEL_MAX = 200
EXTERNAL_URL_MAX = 500
MAX_REQUIREMENTS = 20
MAX_SALARY = 10_000_000_000  # UGX; far above any real salary, below the column limit


class _Request(BaseModel):
    # Unknown fields are an error: a client can never send status, published_at, employer_id...
    model_config = ConfigDict(extra="forbid")


class RequirementIn(_Request):
    kind: RequirementKind
    skill_id: uuid.UUID | None = None
    label: str | None = Field(default=None, max_length=2000)
    is_mandatory: bool = False

    @field_validator("label")
    @classmethod
    def _label(cls, value: str | None) -> str | None:
        return clean_line(value, LABEL_MAX, "The requirement")


class VacancyIn(_Request):
    title: str = Field(max_length=2000)
    description: str | None = Field(default=None, max_length=100_000)
    employment_type: EmploymentType | None = None
    work_arrangement: WorkArrangement | None = None
    district_id: uuid.UUID | None = None
    min_qualification_level_id: uuid.UUID | None = None
    min_experience_years: int = Field(default=0, ge=0, le=50)
    salary_min: int | None = Field(default=None, ge=0, le=MAX_SALARY)
    salary_max: int | None = Field(default=None, ge=0, le=MAX_SALARY)
    show_salary: bool = False
    application_method: ApplicationMethod = ApplicationMethod.INTERNAL
    external_url: str | None = Field(default=None, max_length=5000)
    expires_at: AwareDatetime | None = None
    requirements: list[RequirementIn] = Field(default_factory=list, max_length=500)

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        cleaned = clean_line(value, TITLE_MAX, "The job title")
        if not cleaned or len(cleaned) < TITLE_MIN:
            raise _error("invalid_title", f"Enter the job title ({TITLE_MIN} or more letters).")
        return cleaned

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return clean_block(value, DESCRIPTION_MAX, "The description")

    @field_validator("external_url")
    @classmethod
    def _external_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        text = value.strip()
        parts = urlsplit(text)
        if parts.scheme != "https" or not parts.hostname or " " in text:
            raise _error("invalid_url", "Enter a link starting with https://.")
        if len(text) > EXTERNAL_URL_MAX:
            raise _error("too_long", f"The link must be at most {EXTERNAL_URL_MAX} characters.")
        return text


class AdminVacancyIn(VacancyIn):
    """An admin creates a vacancy for a partner employer, and may publish it at once."""

    employer_id: uuid.UUID
    publish: bool = False


class RequirementOut(BaseModel):
    id: uuid.UUID
    kind: RequirementKind
    skill_id: uuid.UUID | None
    label: str
    is_mandatory: bool

    @classmethod
    def from_requirement(cls, item: VacancyRequirement) -> "RequirementOut":
        return cls(
            id=item.id,
            kind=item.kind,
            skill_id=item.skill_id,
            label=item.label,
            is_mandatory=item.is_mandatory,
        )


class VacancyOut(BaseModel):
    id: uuid.UUID
    employer_id: uuid.UUID
    title: str
    description: str | None
    employment_type: EmploymentType | None
    work_arrangement: WorkArrangement | None
    district_id: uuid.UUID | None
    min_qualification_level_id: uuid.UUID | None
    min_experience_years: int
    salary_min: int | None
    salary_max: int | None
    show_salary: bool
    application_method: ApplicationMethod
    external_url: str | None
    status: VacancyStatus
    published_at: datetime | None
    expires_at: datetime | None
    # Published and not yet expired: what the public can see.
    is_live: bool
    created_by_admin: bool
    requirements: list[RequirementOut]
    # Applications received, and how many have not been looked at yet.
    application_count: int = 0
    new_application_count: int = 0
    created_at: datetime
    updated_at: datetime

    @classmethod
    def build(
        cls,
        vacancy: Vacancy,
        requirements: list[VacancyRequirement],
        is_live: bool,
        application_count: int = 0,
        new_application_count: int = 0,
    ) -> "VacancyOut":
        return cls(
            id=vacancy.id,
            employer_id=vacancy.employer_id,
            title=vacancy.title,
            description=vacancy.description,
            employment_type=vacancy.employment_type,
            work_arrangement=vacancy.work_arrangement,
            district_id=vacancy.district_id,
            min_qualification_level_id=vacancy.min_qualification_level_id,
            min_experience_years=vacancy.min_experience_years,
            salary_min=vacancy.salary_min,
            salary_max=vacancy.salary_max,
            show_salary=vacancy.show_salary,
            application_method=vacancy.application_method,
            external_url=vacancy.external_url,
            status=vacancy.status,
            published_at=vacancy.published_at,
            expires_at=vacancy.expires_at,
            is_live=is_live,
            created_by_admin=vacancy.created_by_admin,
            requirements=[RequirementOut.from_requirement(item) for item in requirements],
            application_count=application_count,
            new_application_count=new_application_count,
            created_at=vacancy.created_at,
            updated_at=vacancy.updated_at,
        )

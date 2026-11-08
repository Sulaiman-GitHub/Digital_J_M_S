"""What the public sees of a vacancy. Never contact data, ids of people, or internal
fields (created_by_admin, status, employer id, who edited what)."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models import ApplicationMethod, EmploymentType, WorkArrangement
from app.schemas.vacancy import RequirementOut


class VacancyCard(BaseModel):
    """Card-sized: enough for a list, no description."""

    id: uuid.UUID
    title: str
    company_name: str
    # Address of the company logo, or null when it has none.
    company_logo_url: str | None = None
    district_id: uuid.UUID | None
    district_name: str | None
    employment_type: EmploymentType
    work_arrangement: WorkArrangement
    published_at: datetime
    expires_at: datetime
    # Only filled when the employer chose to show the salary.
    salary_min: int | None
    salary_max: int | None


class PublicEmployer(BaseModel):
    company_name: str
    district_name: str | None
    logo_url: str | None = None


class VacancyDetail(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    employment_type: EmploymentType
    work_arrangement: WorkArrangement
    district_id: uuid.UUID | None
    district_name: str | None
    min_qualification_level_id: uuid.UUID | None
    min_qualification_level_name: str | None
    min_experience_years: int
    salary_min: int | None
    salary_max: int | None
    application_method: ApplicationMethod
    # Where to apply for an external vacancy; null for internal ones.
    external_url: str | None
    published_at: datetime
    expires_at: datetime
    requirements: list[RequirementOut]
    employer: PublicEmployer

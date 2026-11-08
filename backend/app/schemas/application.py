"""Application request and response schemas."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import ApplicationStatus, VacancyStatus
from app.schemas.profile import clean_block

COVER_NOTE_MAX = 2000
NOTE_MAX = 1000


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ApplyIn(_Request):
    cover_note: str | None = Field(default=None, max_length=20_000)

    @field_validator("cover_note")
    @classmethod
    def _cover_note(cls, value: str | None) -> str | None:
        return clean_block(value, COVER_NOTE_MAX, "The cover note")


class StatusChangeIn(_Request):
    status: ApplicationStatus
    note: str | None = Field(default=None, max_length=20_000)

    @field_validator("note")
    @classmethod
    def _note(cls, value: str | None) -> str | None:
        return clean_block(value, NOTE_MAX, "The note")


class HistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    from_status: ApplicationStatus | None
    to_status: ApplicationStatus
    # "applicant" or "employer": who made the change. Never a name or an id.
    by: str
    note: str | None
    created_at: datetime


class VacancySummary(BaseModel):
    id: uuid.UUID
    title: str
    company_name: str
    status: VacancyStatus
    is_live: bool


class CvSummary(BaseModel):
    original_filename: str
    content_type: str
    size_bytes: int


class ApplicationItem(BaseModel):
    """A row in the applicant's own list."""

    id: uuid.UUID
    status: ApplicationStatus
    submitted_at: datetime
    updated_at: datetime
    vacancy: VacancySummary


class ApplicantItem(BaseModel):
    """A row in an employer's list of applicants for one vacancy."""

    id: uuid.UUID
    status: ApplicationStatus
    submitted_at: datetime
    updated_at: datetime
    applicant_name: str
    applicant_email: str
    qualification: str | None
    institution: str | None
    has_cover_note: bool


class ApplicationDetail(BaseModel):
    id: uuid.UUID
    status: ApplicationStatus
    submitted_at: datetime
    updated_at: datetime
    cover_note: str | None
    vacancy: VacancySummary
    profile: dict[str, Any]
    cv: CvSummary
    # Only the vacancy's employer sees the applicant's email address.
    applicant_email: str | None
    # What the person looking can do next: the statuses this caller may move it to.
    next_statuses: list[ApplicationStatus]
    history: list[HistoryItem]

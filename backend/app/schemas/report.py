"""Report request and response schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import ReportReason, ReportStatus, VacancyStatus, VerificationStatus
from app.schemas.profile import clean_block

DETAILS_MAX = 2000
NOTE_MAX = 1000


class _Request(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ReportIn(_Request):
    reason: ReportReason
    details: str | None = Field(default=None, max_length=20_000)

    @field_validator("details")
    @classmethod
    def _details(cls, value: str | None) -> str | None:
        return clean_block(value, DETAILS_MAX, "The details")


class ReportCreated(BaseModel):
    id: uuid.UUID
    status: ReportStatus
    created_at: datetime


class ReportedVacancy(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    status: VacancyStatus
    is_live: bool
    company_name: str
    employer_id: uuid.UUID
    employer_status: VerificationStatus


class AdminReportItem(BaseModel):
    id: uuid.UUID
    reason: ReportReason
    details: str | None
    status: ReportStatus
    created_at: datetime
    handled_at: datetime | None
    reporter_email: str | None  # null if the reporter's account was erased
    vacancy: ReportedVacancy
    # How many reports about this vacancy are still open (this one included while open).
    open_reports_for_vacancy: int


class ResolveIn(_Request):
    action: Literal["dismiss", "action"]
    # Why. Needed when suspending the employer (the employer sees it); optional otherwise.
    note: str | None = Field(default=None, max_length=20_000)
    # Only with action="action": also suspend the company that posted the vacancy.
    suspend_employer: bool = False

    @field_validator("note")
    @classmethod
    def _note(cls, value: str | None) -> str | None:
        return clean_block(value, NOTE_MAX, "The note")

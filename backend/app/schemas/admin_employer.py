"""Admin views of employers and the verification decisions."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models import VerificationStatus


class ReasonIn(BaseModel):
    # Unknown fields are an error. The service trims the reason and enforces the length.
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(max_length=5000)


class EmployerListItem(BaseModel):
    id: uuid.UUID
    company_name: str
    owner_email: str
    district_name: str
    verification_status: VerificationStatus
    submitted_at: datetime | None
    decided_at: datetime | None


class OwnerOut(BaseModel):
    id: uuid.UUID
    email: str
    email_verified: bool


class HistoryItem(BaseModel):
    id: uuid.UUID
    from_status: VerificationStatus
    to_status: VerificationStatus
    actor_email: str | None  # null if the actor's account was erased
    reason: str | None
    created_at: datetime


class EmployerDetail(BaseModel):
    id: uuid.UUID
    owner: OwnerOut
    company_name: str
    registration_number: str | None
    website: str | None
    contact_phone: str | None
    district_id: uuid.UUID
    district_name: str
    description: str | None
    verification_status: VerificationStatus
    submitted_at: datetime | None
    decided_at: datetime | None
    created_at: datetime
    history: list[HistoryItem]

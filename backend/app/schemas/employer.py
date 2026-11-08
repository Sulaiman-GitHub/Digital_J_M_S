"""Employer profile request and response schemas."""

import re
import uuid
from datetime import datetime
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import Employer, VerificationStatus
from app.schemas.profile import _error, clean_block, clean_line

COMPANY_NAME_MIN, COMPANY_NAME_MAX = 2, 200
REGISTRATION_NUMBER_MAX = 50
WEBSITE_MAX = 300
DESCRIPTION_MAX = 2000

# Ugandan numbers: mobile (07..) or landline (03.., 04..), as +256XXXXXXXXX or 0XXXXXXXXX.
_PHONE_FORMS = (re.compile(r"^\+?256([347]\d{8})$"), re.compile(r"^0([347]\d{8})$"))


def normalise_business_phone(value: str) -> str:
    digits = re.sub(r"[\s\-().]", "", value)
    for form in _PHONE_FORMS:
        match = form.match(digits)
        if match:
            return f"+256{match.group(1)}"
    raise _error(
        "invalid_phone",
        "Enter a Ugandan phone number, like 0772 123456, 0414 123456 or +256 414 123456.",
    )


def clean_website(value: str) -> str:
    """http or https only, with a host. Never javascript:, data: and the like."""
    text = value.strip()
    parts = urlsplit(text)
    if parts.scheme not in ("http", "https") or not parts.hostname or " " in text:
        raise _error("invalid_url", "Enter a website address starting with https:// or http://.")
    return text


class _Request(BaseModel):
    # Unknown fields are an error: a client can never send verification_status, owner_user_id...
    model_config = ConfigDict(extra="forbid")


class EmployerIn(_Request):
    company_name: str = Field(max_length=1000)
    registration_number: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=1000)
    contact_phone: str | None = Field(default=None, max_length=100)
    district_id: uuid.UUID
    description: str | None = Field(default=None, max_length=20000)

    @field_validator("company_name")
    @classmethod
    def _company_name(cls, value: str) -> str:
        cleaned = clean_line(value, COMPANY_NAME_MAX, "The company name")
        if not cleaned or len(cleaned) < COMPANY_NAME_MIN:
            raise _error(
                "invalid_name", f"Enter the company name ({COMPANY_NAME_MIN} or more letters)."
            )
        return cleaned

    @field_validator("registration_number")
    @classmethod
    def _registration_number(cls, value: str | None) -> str | None:
        return clean_line(value, REGISTRATION_NUMBER_MAX, "The registration number")

    @field_validator("website")
    @classmethod
    def _website(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        cleaned = clean_website(value)
        if len(cleaned) > WEBSITE_MAX:
            raise _error("too_long", f"The website must be at most {WEBSITE_MAX} characters.")
        return cleaned

    @field_validator("contact_phone")
    @classmethod
    def _contact_phone(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return normalise_business_phone(value)

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return clean_block(value, DESCRIPTION_MAX, "The description")


class EmployerOut(BaseModel):
    id: uuid.UUID
    company_name: str
    registration_number: str | None
    website: str | None
    contact_phone: str | None
    district_id: uuid.UUID
    description: str | None
    verification_status: VerificationStatus
    # Why the last decision was a rejection or suspension; null in every other state.
    status_reason: str | None
    can_publish: bool
    submitted_at: datetime | None
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def build(
        cls, employer: Employer, status_reason: str | None, can_publish: bool
    ) -> "EmployerOut":
        return cls(
            id=employer.id,
            company_name=employer.company_name,
            registration_number=employer.registration_number,
            website=employer.website,
            contact_phone=employer.contact_phone,
            district_id=employer.district_id,
            description=employer.description,
            verification_status=employer.verification_status,
            status_reason=status_reason,
            can_publish=can_publish,
            submitted_at=employer.submitted_at,
            decided_at=employer.decided_at,
            created_at=employer.created_at,
            updated_at=employer.updated_at,
        )

"""Seeker profile request and response schemas.

Structure, lengths and formats are checked here first (a bad phone number, a name that is too
short). Rules that compare several fields, or check the database (study status against dates,
institution choice, unknown ids), live in services/profiles.py and are reported together, but only
once the formats are right. A form that checks formats in the browser first therefore
shows every rule problem in one go.
"""

import re
import unicodedata
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_core import PydanticCustomError

from app.models import ProfileExperience, SeekerProfile, Skill, StudyStatus
from app.schemas.reference import SkillOut

MAX_SKILLS = 30
MAX_EXPERIENCES = 10
FULL_NAME_MIN, FULL_NAME_MAX = 2, 150
SUMMARY_MAX = 1000
DESCRIPTION_MAX = 1000

# Uganda mobile numbers: +256 7XX XXX XXX, 256 7XX..., or 07XX XXX XXX. Stored as +2567XXXXXXXX.
_PHONE_FORMS = (re.compile(r"^\+?256(7\d{8})$"), re.compile(r"^0(7\d{8})$"))


def _error(code: str, message: str) -> PydanticCustomError:
    return PydanticCustomError(code, message)


def _has_control_characters(value: str, *, allow_line_breaks: bool = False) -> bool:
    for char in value:
        if unicodedata.category(char) == "Cc" and not (allow_line_breaks and char in "\n\t"):
            return True
    return False


def clean_line(value: str | None, max_length: int, what: str) -> str | None:
    """One line of text: trimmed, inner whitespace collapsed. Blank becomes None."""
    if value is None:
        return None
    # split() treats tabs and line breaks as spaces; anything else odd is refused.
    if _has_control_characters("".join(value.split())):
        raise _error("invalid_text", f"{what} contains characters that are not allowed.")
    cleaned = " ".join(value.split())
    if not cleaned:
        return None
    if len(cleaned) > max_length:
        raise _error("too_long", f"{what} must be at most {max_length} characters.")
    return cleaned


def clean_block(value: str | None, max_length: int, what: str) -> str | None:
    """Longer text that may have line breaks: trimmed, line endings normalised."""
    if value is None:
        return None
    text = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    if _has_control_characters(text, allow_line_breaks=True):
        raise _error("invalid_text", f"{what} contains characters that are not allowed.")
    if not text:
        return None
    if len(text) > max_length:
        raise _error("too_long", f"{what} must be at most {max_length} characters.")
    return text


def normalise_ugandan_phone(value: str) -> str:
    digits = re.sub(r"[\s\-().]", "", value)
    for form in _PHONE_FORMS:
        match = form.match(digits)
        if match:
            return f"+256{match.group(1)}"
    raise _error(
        "invalid_phone",
        "Enter a Ugandan mobile number, like 0772 123456 or +256 772 123456.",
    )


class _Request(BaseModel):
    # Unknown fields are an error: a client can never send user_id, is_discoverable and so on.
    model_config = ConfigDict(extra="forbid")


class ExperienceIn(_Request):
    title: str = Field(max_length=300)
    organisation: str = Field(max_length=300)
    start_date: date
    end_date: date | None = None  # empty means "current"
    description: str | None = Field(default=None, max_length=3000)

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        cleaned = clean_line(value, 150, "The job title")
        if not cleaned:
            raise _error("required", "Enter the job title.")
        return cleaned

    @field_validator("organisation")
    @classmethod
    def _organisation(cls, value: str) -> str:
        cleaned = clean_line(value, 150, "The organisation")
        if not cleaned:
            raise _error("required", "Enter the organisation.")
        return cleaned

    @field_validator("description")
    @classmethod
    def _description(cls, value: str | None) -> str | None:
        return clean_block(value, DESCRIPTION_MAX, "The description")


class ProfileIn(_Request):
    """The whole profile. PUT replaces everything, including skills and experiences."""

    full_name: str = Field(max_length=300)
    phone: str | None = Field(default=None, max_length=40)
    institution_id: uuid.UUID | None = None
    institution_other_name: str | None = Field(default=None, max_length=500)
    qualification_level_id: uuid.UUID
    field_of_study_id: uuid.UUID | None = None
    field_of_study_other: str | None = Field(default=None, max_length=500)
    study_status: StudyStatus
    expected_completion_date: date | None = None
    graduation_date: date | None = None
    district_id: uuid.UUID
    summary: str | None = Field(default=None, max_length=5000)
    skill_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    experiences: list[ExperienceIn] = Field(default_factory=list, max_length=100)

    @field_validator("full_name")
    @classmethod
    def _full_name(cls, value: str) -> str:
        cleaned = clean_line(value, FULL_NAME_MAX, "Your name")
        if not cleaned or len(cleaned) < FULL_NAME_MIN:
            raise _error("invalid_name", f"Enter your full name ({FULL_NAME_MIN} or more letters).")
        return cleaned

    @field_validator("phone")
    @classmethod
    def _phone(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return normalise_ugandan_phone(value)

    @field_validator("institution_other_name")
    @classmethod
    def _institution_other(cls, value: str | None) -> str | None:
        return clean_line(value, 200, "The institution name")

    @field_validator("field_of_study_other")
    @classmethod
    def _field_other(cls, value: str | None) -> str | None:
        return clean_line(value, 150, "The field of study")

    @field_validator("summary")
    @classmethod
    def _summary(cls, value: str | None) -> str | None:
        return clean_block(value, SUMMARY_MAX, "Your summary")

    @field_validator("skill_ids")
    @classmethod
    def _skill_ids(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        unique = list(dict.fromkeys(value))  # repeated skills are merged, order kept
        if len(unique) > MAX_SKILLS:
            raise _error("too_many", f"Choose at most {MAX_SKILLS} skills.")
        return unique

    @field_validator("experiences")
    @classmethod
    def _experiences(cls, value: list[ExperienceIn]) -> list[ExperienceIn]:
        if len(value) > MAX_EXPERIENCES:
            raise _error("too_many", f"Add at most {MAX_EXPERIENCES} experiences.")
        return value


class ExperienceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    organisation: str
    start_date: date
    end_date: date | None
    description: str | None


class ProfileOut(BaseModel):
    """The owner's profile. No user id and no is_discoverable: neither belongs to the client."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    phone: str | None
    institution_id: uuid.UUID | None
    institution_other_name: str | None
    qualification_level_id: uuid.UUID
    field_of_study_id: uuid.UUID | None
    field_of_study_other: str | None
    study_status: StudyStatus
    expected_completion_date: date | None
    graduation_date: date | None
    district_id: uuid.UUID
    summary: str | None
    skills: list[SkillOut]
    experiences: list[ExperienceOut]
    created_at: datetime
    updated_at: datetime

    @classmethod
    def build(
        cls,
        profile: SeekerProfile,
        skills: list[Skill],
        experiences: list[ProfileExperience],
    ) -> "ProfileOut":
        """From the stored rows. Only the fields declared above are copied, so nothing else
        (user_id, is_discoverable) can ever reach the response."""
        own = {
            name: getattr(profile, name)
            for name in cls.model_fields
            if name not in {"skills", "experiences"}
        }
        return cls(
            **own,
            skills=[SkillOut.model_validate(skill) for skill in skills],
            experiences=[ExperienceOut.model_validate(item) for item in experiences],
        )

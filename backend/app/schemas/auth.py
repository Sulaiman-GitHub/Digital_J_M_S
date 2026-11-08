import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.security import PASSWORD_MAX_LENGTH
from app.models import User, UserRole, UserStatus

EMAIL_MAX_LENGTH = 254
TOKEN_MAX_LENGTH = 256


class _Request(BaseModel):
    # Unknown fields are an error, so e.g. {"status": "active"} cannot sneak in.
    model_config = ConfigDict(extra="forbid")


class RegisterRequest(_Request):
    email: EmailStr = Field(max_length=EMAIL_MAX_LENGTH)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)
    # Only these two. "admin" (or anything else) is a validation error.
    role: Literal["job_seeker", "employer"]
    # Must be true: the person agrees to the Terms and the Privacy Policy (recorded as consents).
    accept_terms: bool

    @field_validator("accept_terms")
    @classmethod
    def _must_accept(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Agree to the Terms and the Privacy Policy to create an account.")
        return value


class LoginRequest(_Request):
    # Plain str, not EmailStr: a malformed email simply fails to log in like any other.
    email: str = Field(min_length=1, max_length=EMAIL_MAX_LENGTH)
    password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class TokenRequest(_Request):
    token: str = Field(min_length=1, max_length=TOKEN_MAX_LENGTH)


class ForgotPasswordRequest(_Request):
    email: EmailStr = Field(max_length=EMAIL_MAX_LENGTH)


class ResetPasswordRequest(_Request):
    token: str = Field(min_length=1, max_length=TOKEN_MAX_LENGTH)
    new_password: str = Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    role: UserRole
    status: UserStatus
    email_verified: bool
    # Filled in Phase 3 (employer profiles); always null until then.
    employer_status: str | None = None
    created_at: datetime

    @classmethod
    def from_user(cls, user: User) -> "UserOut":
        return cls(
            id=user.id,
            email=user.email,
            role=user.role,
            status=user.status,
            email_verified=user.email_verified_at is not None,
            created_at=user.created_at,
        )

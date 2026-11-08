"""Application settings.

All configuration comes from environment variables (or a local, gitignored .env file)
through this module. Nothing else in the app reads os.environ.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from limits import parse as parse_rate_limit
from pydantic import Field, SecretStr, ValidationInfo, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent

# Placeholder values from .env.example. They are fine for development only.
_PLACEHOLDER_SECRETS = {"", "change-me"}
_MIN_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Later files win: backend/.env overrides the repo-root .env.
        env_file=(REPO_ROOT / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    secret_key: SecretStr = SecretStr("change-me")

    database_url: SecretStr = SecretStr("")
    test_database_url: SecretStr = SecretStr("")

    frontend_base_url: str = "http://localhost:5173"
    # Per-IP limit on register, login, forgot-password and resend-verification.
    # End-to-end tests raise it: one browser makes many such requests from one address.
    auth_rate_limit: str = "5/minute"
    session_ttl_hours: int = 336

    # console: log messages (development only); smtp: real delivery; fake: record in memory (tests)
    email_backend: Literal["console", "smtp", "fake"] = "console"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: SecretStr = SecretStr("")
    email_from: str = "no-reply@example.com"

    # Files live outside any public folder. A relative STORAGE_LOCAL_DIR is taken from backend/.
    storage_backend: Literal["local"] = "local"
    storage_local_dir: str = "./storage"
    max_cv_bytes: int = Field(default=5_242_880, gt=0)  # 5 MB
    max_image_bytes: int = Field(default=2_097_152, gt=0)  # 2 MB, photos and logos (6.6)
    # Per-IP limit on CV uploads (each one can be several MB).
    upload_rate_limit: str = "10/minute"
    # Per-IP limit on vacancy reports.
    report_rate_limit: str = "10/hour"
    # Per-IP limit on applications (each one copies a CV file).
    apply_rate_limit: str = "30/hour"

    # Version of the Terms and Privacy Policy that users agree to. Change it when the texts change;
    # consents record the version they were given for.
    policy_version: str = Field(default="2026-11-draft", min_length=1, max_length=50)

    admin_email: str = ""

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @field_validator(
        "auth_rate_limit", "upload_rate_limit", "report_rate_limit", "apply_rate_limit"
    )
    @classmethod
    def _valid_rate_limit(cls, value: str, info: ValidationInfo) -> str:
        try:
            parse_rate_limit(value)
        except ValueError as exc:
            name = (info.field_name or "rate limit").upper()
            raise ValueError(f"{name} is not a valid limit such as '5/minute': {exc}") from exc
        return value

    @model_validator(mode="after")
    def _test_environment_uses_the_test_database(self) -> "Settings":
        """APP_ENV=test always runs against TEST_DATABASE_URL, and only if it is a *_test database.

        This keeps end-to-end runs (and anything else started in test mode) away from djm_dev.
        """
        if self.app_env != "test":
            return self
        url = self.test_database_url.get_secret_value()
        try:
            name = make_url(url).database if url else None
        except ArgumentError:
            name = None
        if not name or not name.endswith("_test"):
            raise ValueError(
                "APP_ENV=test needs TEST_DATABASE_URL pointing at a database whose name "
                "ends with _test"
            )
        self.database_url = self.test_database_url
        return self

    @model_validator(mode="after")
    def _no_default_secrets_in_production(self) -> "Settings":
        if not self.is_production:
            return self

        problems: list[str] = []
        secret_key = self.secret_key.get_secret_value()
        if secret_key in _PLACEHOLDER_SECRETS or len(secret_key) < _MIN_SECRET_KEY_LENGTH:
            problems.append(
                f"SECRET_KEY must be set to a random value of at least "
                f"{_MIN_SECRET_KEY_LENGTH} characters"
            )
        database_url = self.database_url.get_secret_value()
        if not database_url or "change-me" in database_url:
            problems.append("DATABASE_URL must be set to a real value")
        if self.email_backend != "smtp":
            # The console sender logs reset and verification links, which act like passwords.
            problems.append("EMAIL_BACKEND must be smtp in production")
        elif not self.smtp_host:
            problems.append("SMTP_HOST must be set when EMAIL_BACKEND=smtp")

        if problems:
            raise ValueError("Invalid production configuration: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

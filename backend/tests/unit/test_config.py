import pytest
from pydantic import ValidationError

from app.core.config import Settings

STRONG_KEY = "x" * 40
REAL_DB = "postgresql+psycopg://djm_user:real-password@db:5432/djm"


def _settings(**overrides: object) -> Settings:
    # _env_file=None keeps a developer's local .env out of these tests.
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def test_development_accepts_placeholder_values() -> None:
    settings = _settings(app_env="development", secret_key="change-me")

    assert settings.is_production is False


def test_production_rejects_placeholder_secret_key() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        _settings(app_env="production", secret_key="change-me", database_url=REAL_DB)


def test_production_rejects_short_secret_key() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        _settings(app_env="production", secret_key="short", database_url=REAL_DB)


def test_production_rejects_missing_database_url() -> None:
    with pytest.raises(ValidationError, match="DATABASE_URL"):
        _settings(app_env="production", secret_key=STRONG_KEY, database_url="")


PRODUCTION_SMTP = {"email_backend": "smtp", "smtp_host": "smtp.example.com"}


def test_production_accepts_real_values() -> None:
    settings = _settings(
        app_env="production", secret_key=STRONG_KEY, database_url=REAL_DB, **PRODUCTION_SMTP
    )

    assert settings.is_production is True


@pytest.mark.parametrize("backend", ["console", "fake"])
def test_production_refuses_email_backends_that_do_not_deliver(backend: str) -> None:
    # The console sender logs verification and reset links, which act like passwords.
    with pytest.raises(ValidationError, match="EMAIL_BACKEND must be smtp"):
        _settings(
            app_env="production", secret_key=STRONG_KEY, database_url=REAL_DB, email_backend=backend
        )


def test_production_smtp_needs_a_host() -> None:
    with pytest.raises(ValidationError, match="SMTP_HOST"):
        _settings(
            app_env="production", secret_key=STRONG_KEY, database_url=REAL_DB, email_backend="smtp"
        )


@pytest.mark.parametrize("backend", ["console", "smtp", "fake"])
def test_development_allows_every_email_backend(backend: str) -> None:
    assert _settings(email_backend=backend).email_backend == backend


def test_secrets_are_not_shown_in_repr() -> None:
    settings = _settings(secret_key=STRONG_KEY, database_url=REAL_DB)

    assert STRONG_KEY not in repr(settings)
    assert "real-password" not in repr(settings)


TEST_DB = "postgresql+psycopg://u:p@localhost:5432/anything_test"


def test_test_environment_uses_the_test_database_even_if_database_url_points_elsewhere() -> None:
    settings = _settings(
        app_env="test",
        database_url="postgresql+psycopg://u:p@localhost:5432/djm_dev",
        test_database_url=TEST_DB,
    )

    assert settings.database_url == settings.test_database_url
    assert "djm_dev" not in settings.database_url.get_secret_value()


@pytest.mark.parametrize(
    "url",
    [
        "",
        "postgresql+psycopg://u:p@localhost:5432/djm_dev",
        "postgresql+psycopg://u:p@h/djm_testing",
        "not a url",
    ],
)
def test_test_environment_refuses_anything_but_a_test_database(url: str) -> None:
    with pytest.raises(ValidationError, match="APP_ENV=test needs TEST_DATABASE_URL"):
        _settings(app_env="test", test_database_url=url)


def test_auth_rate_limit_defaults_to_five_per_minute_and_can_be_raised() -> None:
    assert _settings().auth_rate_limit == "5/minute"
    assert _settings(auth_rate_limit="1000/minute").auth_rate_limit == "1000/minute"


@pytest.mark.parametrize("bad", ["", "fast", "5 per fortnight", "5/"])
def test_auth_rate_limit_must_be_a_valid_limit(bad: str) -> None:
    with pytest.raises(ValidationError, match="AUTH_RATE_LIMIT"):
        _settings(auth_rate_limit=bad)

import pytest

from app.core.config import Settings
from tests.db_guard import UnsafeTestDatabaseError, assert_test_database

BASE = "postgresql+psycopg://djm_user:secret-pw@localhost:5432"


def test_accepts_database_ending_in_test() -> None:
    assert assert_test_database(f"{BASE}/djm_test") == "djm_test"


@pytest.mark.parametrize(
    "url",
    [
        f"{BASE}/djm_dev",
        f"{BASE}/djm_testing",
        f"{BASE}/test_djm",
        f"{BASE}/",
        BASE,
    ],
)
def test_rejects_non_test_databases(url: str) -> None:
    with pytest.raises(UnsafeTestDatabaseError, match="Refusing to run tests"):
        assert_test_database(url)


def test_rejects_missing_url() -> None:
    with pytest.raises(UnsafeTestDatabaseError, match="not set"):
        assert_test_database("")


def test_rejects_invalid_url() -> None:
    with pytest.raises(UnsafeTestDatabaseError, match="not a valid"):
        assert_test_database("not a url")


def test_error_never_contains_the_password() -> None:
    with pytest.raises(UnsafeTestDatabaseError) as info:
        assert_test_database(f"{BASE}/djm_dev")

    assert "secret-pw" not in str(info.value)


def test_settings_fixture_uses_test_database(settings: Settings) -> None:
    assert settings.app_env == "test"
    assert settings.database_url == settings.test_database_url
    assert assert_test_database(settings.database_url.get_secret_value()).endswith("_test")

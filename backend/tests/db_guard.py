"""Safety check: tests may only ever touch a database whose name ends with _test."""

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

REQUIRED_SUFFIX = "_test"


class UnsafeTestDatabaseError(RuntimeError):
    pass


def assert_test_database(url: str) -> str:
    """Return the database name if it is a test database, otherwise raise.

    Never include the URL itself in the error: it may contain a password.
    """
    if not url:
        raise UnsafeTestDatabaseError(
            "TEST_DATABASE_URL is not set. Copy .env.example to .env and point "
            f"TEST_DATABASE_URL at a database whose name ends with '{REQUIRED_SUFFIX}'."
        )
    try:
        name = make_url(url).database
    except ArgumentError as exc:
        raise UnsafeTestDatabaseError("TEST_DATABASE_URL is not a valid database URL.") from exc

    if not name or not name.endswith(REQUIRED_SUFFIX):
        raise UnsafeTestDatabaseError(
            f"Refusing to run tests: TEST_DATABASE_URL points at database {name!r}, "
            f"whose name does not end with '{REQUIRED_SUFFIX}'. Tests may delete data."
        )
    return name

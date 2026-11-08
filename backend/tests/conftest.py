from collections.abc import Iterator

import pytest
from alembic import command
from argon2 import PasswordHasher
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.api.deps import email_sender
from app.core import security
from app.core.config import Settings, get_settings
from app.core.rate_limit import limiter
from app.db.session import get_db
from app.integrations.email import FakeEmailSender
from app.main import create_app
from tests.alembic_helpers import alembic_config
from tests.db_guard import UnsafeTestDatabaseError, assert_test_database


def pytest_configure(config: pytest.Config) -> None:
    """Stop the whole run before any test if the test database is not a *_test database."""
    url = get_settings().test_database_url.get_secret_value()
    try:
        assert_test_database(url)
    except UnsafeTestDatabaseError as exc:
        raise pytest.UsageError(str(exc)) from None


@pytest.fixture
def settings() -> Settings:
    """Settings for tests: test environment, and the app database is the test database."""
    base = get_settings()
    return base.model_copy(
        update={"app_env": "test", "database_url": base.test_database_url},
    )


@pytest.fixture(scope="session")
def test_database_url() -> str:
    url = get_settings().test_database_url.get_secret_value()
    assert_test_database(url)
    return url


@pytest.fixture(scope="session")
def engine(test_database_url: str) -> Iterator[Engine]:
    """Engine on the test database, with a freshly migrated, empty schema once per session.

    The schema is dropped and rebuilt first (alembic_config refuses anything but a *_test
    database) so data committed by an earlier run, such as the Playwright journeys, can never
    leak into tests that count rows.
    """
    config = alembic_config(test_database_url)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    test_engine = create_engine(test_database_url, pool_pre_ping=True)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    """A session inside a transaction that is rolled back after the test.

    join_transaction_mode="create_savepoint" turns commit() calls made by app code into
    savepoint releases, so nothing a test writes survives it.
    """
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection,
        join_transaction_mode="create_savepoint",
        autoflush=False,
        expire_on_commit=False,
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture(autouse=True)
def fast_password_hashing(monkeypatch: pytest.MonkeyPatch) -> None:
    """argon2id with minimal cost: same algorithm and code paths, about 1 ms per hash."""
    cheap = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1)
    monkeypatch.setattr(security, "_hasher", cheap)
    monkeypatch.setattr(security, "_DUMMY_HASH", cheap.hash("timing-equaliser"))


@pytest.fixture(autouse=True)
def reset_rate_limits() -> Iterator[None]:
    """Rate limit counters are per process; start every test from zero."""
    limiter.reset()
    limiter.enabled = True
    yield
    limiter.reset()
    limiter.enabled = True


@pytest.fixture
def fake_email() -> FakeEmailSender:
    return FakeEmailSender()


@pytest.fixture
def client(db_session: Session, fake_email: FakeEmailSender) -> Iterator[TestClient]:
    """API client whose requests use the test session and record emails in fake_email."""
    app = create_app()

    def override_get_db() -> Iterator[Session]:
        # Same commit/rollback behaviour as get_db, on the rolled-back test transaction.
        try:
            yield db_session
            db_session.commit()
        except Exception:
            db_session.rollback()
            raise

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[email_sender] = lambda: fake_email
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client

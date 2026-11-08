"""Engine, session factory and the per-request session dependency."""

from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import get_logger

logger = get_logger("db")

# Without this, psycopg waits indefinitely for an unreachable server (on Windows a refused
# localhost connection is retried for minutes), so requests hang instead of returning 503.
# "localhost" may be tried twice (IPv6 then IPv4), so the worst case is about twice this.
CONNECT_TIMEOUT_SECONDS = 3


class DatabaseNotConfiguredError(AppError):
    def __init__(self) -> None:
        super().__init__(
            "database_unavailable",
            "The service is temporarily unavailable. Please try again shortly.",
            status=503,
        )


@lru_cache
def get_engine() -> Engine:
    """Created on first use, so the app can start (and tests can import it) without a database."""
    url = get_settings().database_url.get_secret_value()
    if not url:
        logger.error("DATABASE_URL is not set")
        raise DatabaseNotConfiguredError()
    return create_engine(
        url,
        pool_pre_ping=True,
        connect_args={"connect_timeout": CONNECT_TIMEOUT_SECONDS},
    )


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """One session per request: commit on success, roll back on any error, always close.

    Use it through api.deps.DbSession, which sets scope="function" so the commit runs before the
    response is sent (a failed commit becomes an error response, not a false success).
    """
    session = get_sessionmaker()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

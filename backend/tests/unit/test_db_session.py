from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db import session as session_module
from app.db.session import get_db
from app.main import create_app


@pytest.fixture
def fake_session(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    fake = MagicMock(name="Session")
    monkeypatch.setattr(session_module, "get_sessionmaker", lambda: lambda: fake)
    return fake


def test_get_db_commits_and_closes_on_success(fake_session: MagicMock) -> None:
    dependency = get_db()
    assert next(dependency) is fake_session

    with pytest.raises(StopIteration):
        next(dependency)

    fake_session.commit.assert_called_once()
    fake_session.rollback.assert_not_called()
    fake_session.close.assert_called_once()


def test_get_db_rolls_back_closes_and_reraises_on_error(fake_session: MagicMock) -> None:
    dependency = get_db()
    next(dependency)

    with pytest.raises(RuntimeError, match="boom"):
        dependency.throw(RuntimeError("boom"))

    fake_session.rollback.assert_called_once()
    fake_session.commit.assert_not_called()
    fake_session.close.assert_called_once()


def test_engine_sets_a_connect_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    """An unreachable database must fail fast (503), not hang the request."""
    captured: dict[str, object] = {}
    monkeypatch.setattr(
        session_module, "create_engine", lambda url, **kwargs: captured.update(kwargs)
    )
    with_db = Settings(_env_file=None, database_url="postgresql+psycopg://u:p@h/db_test")  # type: ignore[call-arg]
    monkeypatch.setattr(session_module, "get_settings", lambda: with_db)
    session_module.get_engine.cache_clear()
    try:
        session_module.get_engine()
    finally:
        session_module.get_engine.cache_clear()

    assert captured["connect_args"] == {"connect_timeout": session_module.CONNECT_TIMEOUT_SECONDS}
    assert 0 < session_module.CONNECT_TIMEOUT_SECONDS <= 10


def test_missing_database_url_gives_503_not_a_crash(monkeypatch: pytest.MonkeyPatch) -> None:
    no_db = Settings(_env_file=None, app_env="development", database_url="")  # type: ignore[call-arg]
    monkeypatch.setattr(session_module, "get_settings", lambda: no_db)
    session_module.get_engine.cache_clear()
    session_module.get_sessionmaker.cache_clear()
    try:
        response = TestClient(create_app(), raise_server_exceptions=False).get("/api/v1/health")
    finally:
        session_module.get_engine.cache_clear()
        session_module.get_sessionmaker.cache_clear()

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"

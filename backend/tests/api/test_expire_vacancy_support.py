"""The test-only "expire a vacancy" route: exists only when APP_ENV=test, and does what it says."""

from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import main as main_module
from app.api.routes import test_support as test_support_module
from app.core.config import Settings
from app.db.session import get_db
from app.models import Vacancy
from tests.api.vacancy_helpers import add_vacancy, make_company, make_world

TEST_DB = "postgresql+psycopg://u:p@localhost:5432/anything_test"


def _app(monkeypatch: pytest.MonkeyPatch, db: Session, **overrides: object) -> TestClient:
    settings = Settings(_env_file=None, **overrides)  # type: ignore[arg-type]
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    monkeypatch.setattr(test_support_module, "get_settings", lambda: settings)
    app = main_module.create_app()

    def override_get_db() -> Iterator[Session]:
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def vacancy(db_session: Session) -> Vacancy:
    world = make_world(db_session)
    return add_vacancy(db_session, make_company(db_session, world), world)


def test_expiring_a_vacancy_takes_it_out_of_the_public_list(
    monkeypatch: pytest.MonkeyPatch, db_session: Session, vacancy: Vacancy
) -> None:
    client = _app(monkeypatch, db_session, app_env="test", test_database_url=TEST_DB)
    assert client.get(f"/api/v1/vacancies/{vacancy.id}").status_code == 200

    response = client.post(f"/api/v1/_test/vacancies/{vacancy.id}/expire")

    assert response.status_code == 204
    assert client.get(f"/api/v1/vacancies/{vacancy.id}").status_code == 404
    assert client.get("/api/v1/vacancies").json()["data"] == []
    db_session.refresh(vacancy)
    assert vacancy.status == "published"  # still marked published; expiry is computed


def test_an_unknown_vacancy_is_404(monkeypatch: pytest.MonkeyPatch, db_session: Session) -> None:
    client = _app(monkeypatch, db_session, app_env="test", test_database_url=TEST_DB)

    assert client.post(f"/api/v1/_test/vacancies/{uuid4()}/expire").status_code == 404


def test_the_route_does_not_exist_outside_the_test_environment(
    monkeypatch: pytest.MonkeyPatch, db_session: Session, vacancy: Vacancy
) -> None:
    client = _app(monkeypatch, db_session, app_env="development")

    response = client.post(f"/api/v1/_test/vacancies/{vacancy.id}/expire")

    assert response.status_code == 404
    assert client.get(f"/api/v1/vacancies/{vacancy.id}").status_code == 200  # untouched

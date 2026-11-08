"""Saved jobs: save, unsave, list, who may use it, what is hidden."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import SavedVacancy, UserRole, VacancyStatus
from tests.api.application_helpers import BOSS, SEEKER, Scene, make_scene
from tests.api.auth_helpers import PASSWORD, csrf_headers, error_code
from tests.api.profile_helpers import create_user, login_as
from tests.api.vacancy_helpers import add_vacancy

SAVED = "/api/v1/saved-vacancies"


@pytest.fixture
def scene(db_session: Session, tmp_path: Path) -> Scene:
    root = tmp_path / "storage"
    root.mkdir()
    return make_scene(db_session, root)


@pytest.fixture
def seeker(client: TestClient, scene: Scene) -> TestClient:
    login_as(client, SEEKER)
    return client


@pytest.fixture
def boss(client: TestClient, scene: Scene) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        login_as(other, BOSS)
        yield other


@pytest.fixture
def other_seeker(client: TestClient, scene: Scene, db_session: Session) -> Iterator[TestClient]:
    create_user(db_session, "other@example.com", UserRole.JOB_SEEKER)
    with TestClient(client.app, raise_server_exceptions=False) as other:
        login_as(other, "other@example.com")
        yield other


def save(client: TestClient, vacancy_id, *, csrf: bool = True):
    return client.put(
        f"{SAVED}/{vacancy_id}", headers=csrf_headers(client) if csrf else {}
    )


def unsave(client: TestClient, vacancy_id, *, csrf: bool = True):
    return client.delete(
        f"{SAVED}/{vacancy_id}", headers=csrf_headers(client) if csrf else {}
    )


def ids(client: TestClient) -> list[str]:
    response = client.get(f"{SAVED}/ids")
    assert response.status_code == 200
    return response.json()["data"]["vacancy_ids"]


def count_rows(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(SavedVacancy)) or 0


def another_vacancy(db: Session, scene: Scene, title: str, **overrides):
    vacancy = add_vacancy(db, scene.company, scene.world, title=title, **overrides)
    db.commit()
    return vacancy


# ---------- saving and removing ----------


def test_a_job_seeker_saves_and_removes_a_vacancy(seeker: TestClient, scene: Scene) -> None:
    assert save(seeker, scene.vacancy.id).status_code == 204
    assert ids(seeker) == [str(scene.vacancy.id)]

    assert unsave(seeker, scene.vacancy.id).status_code == 204
    assert ids(seeker) == []


def test_saving_twice_is_safe_and_keeps_one_row(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    assert save(seeker, scene.vacancy.id).status_code == 204
    assert save(seeker, scene.vacancy.id).status_code == 204

    assert count_rows(db_session) == 1


def test_removing_something_not_saved_is_safe(seeker: TestClient, scene: Scene) -> None:
    assert unsave(seeker, scene.vacancy.id).status_code == 204
    assert unsave(seeker, uuid4()).status_code == 204


def test_only_open_vacancies_can_be_saved(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    closed = another_vacancy(db_session, scene, "Closed one", status=VacancyStatus.CLOSED)
    draft = another_vacancy(db_session, scene, "Draft one", status=VacancyStatus.DRAFT)
    past = datetime.now(UTC) - timedelta(days=40)
    expired = another_vacancy(
        db_session, scene, "Expired one", published_at=past, expires_at=past + timedelta(days=10)
    )

    for vacancy_id in (closed.id, draft.id, expired.id, uuid4()):
        response = save(seeker, vacancy_id)
        assert response.status_code == 404
        assert error_code(response) == "vacancy_not_found"
    assert ids(seeker) == []


def test_the_number_of_saved_jobs_is_capped(
    seeker: TestClient, scene: Scene, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.services.saved_vacancies.MAX_SAVED", 2)
    extra = [another_vacancy(db_session, scene, f"Extra {i}") for i in range(2)]
    assert save(seeker, scene.vacancy.id).status_code == 204
    assert save(seeker, extra[0].id).status_code == 204

    response = save(seeker, extra[1].id)

    assert response.status_code == 409
    assert error_code(response) == "saved_limit"
    assert save(seeker, scene.vacancy.id).status_code == 204  # already saved: still fine


# ---------- the list ----------


def test_the_list_holds_cards_newest_saved_first(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    second = another_vacancy(db_session, scene, "Second job")
    save(seeker, scene.vacancy.id)
    save(seeker, second.id)

    response = seeker.get(SAVED)

    assert response.status_code == 200
    body = response.json()
    assert [card["title"] for card in body["data"]] == ["Second job", scene.vacancy.title]
    assert body["meta"] == {"page": 1, "page_size": 20, "total": 2}
    card = body["data"][0]
    assert card["company_name"] == "Ssese Foods Ltd"
    assert "company_logo_url" in card and "description" not in card and "status" not in card


def test_the_list_is_paged(seeker: TestClient, scene: Scene, db_session: Session) -> None:
    for i in range(3):
        save(seeker, another_vacancy(db_session, scene, f"Job {i}").id)

    first = seeker.get(SAVED, params={"page": 1, "page_size": 2}).json()
    second = seeker.get(SAVED, params={"page": 2, "page_size": 2}).json()

    assert first["meta"]["total"] == 3
    assert len(first["data"]) == 2 and len(second["data"]) == 1
    assert seeker.get(SAVED, params={"page_size": 500}).status_code == 422
    assert seeker.get(SAVED, params={"page": 0}).status_code == 422


def test_a_vacancy_that_is_no_longer_open_is_hidden_but_not_forgotten(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    save(seeker, scene.vacancy.id)
    scene.vacancy.status = VacancyStatus.CLOSED
    db_session.flush()

    assert seeker.get(SAVED).json()["data"] == []
    assert seeker.get(SAVED).json()["meta"]["total"] == 0
    assert ids(seeker) == []
    assert count_rows(db_session) == 1


def test_one_person_never_sees_anothers_saved_jobs(
    seeker: TestClient, other_seeker: TestClient, scene: Scene
) -> None:
    save(seeker, scene.vacancy.id)

    assert ids(other_seeker) == []
    assert other_seeker.get(SAVED).json()["data"] == []
    unsave(other_seeker, scene.vacancy.id)  # cannot remove someone else's bookmark
    assert ids(seeker) == [str(scene.vacancy.id)]


# ---------- who may use it ----------


def test_everything_needs_login(client: TestClient, scene: Scene) -> None:
    with TestClient(client.app, raise_server_exceptions=False) as anonymous:
        assert anonymous.get(SAVED).status_code == 401
        assert anonymous.get(f"{SAVED}/ids").status_code == 401
        assert anonymous.put(f"{SAVED}/{scene.vacancy.id}").status_code == 401
        assert anonymous.delete(f"{SAVED}/{scene.vacancy.id}").status_code == 401


def test_only_job_seekers_may_use_it(boss: TestClient, scene: Scene) -> None:
    assert boss.get(SAVED).status_code == 403
    assert boss.get(f"{SAVED}/ids").status_code == 403
    assert save(boss, scene.vacancy.id).status_code == 403
    assert unsave(boss, scene.vacancy.id).status_code == 403


def test_changing_needs_csrf(seeker: TestClient, scene: Scene) -> None:
    assert save(seeker, scene.vacancy.id, csrf=False).status_code == 403
    assert unsave(seeker, scene.vacancy.id, csrf=False).status_code == 403
    assert ids(seeker) == []


def test_a_bad_id_is_a_422(seeker: TestClient) -> None:
    assert seeker.put(f"{SAVED}/not-an-id", headers=csrf_headers(seeker)).status_code == 422


# ---------- account export and deletion ----------


def test_the_export_lists_saved_jobs_and_deleting_the_account_removes_them(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    save(seeker, scene.vacancy.id)

    exported = seeker.get("/api/v1/account/export").json()["data"]
    assert [item["vacancy_id"] for item in exported["saved_jobs"]] == [str(scene.vacancy.id)]

    response = seeker.request(
        "DELETE", "/api/v1/account", json={"password": PASSWORD}, headers=csrf_headers(seeker)
    )

    assert response.status_code == 204
    db_session.expire_all()
    assert count_rows(db_session) == 0


def test_the_openapi_lists_the_saved_operations(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert {p: sorted(m) for p, m in paths.items() if "saved-vacancies" in p} == {
        "/api/v1/saved-vacancies": ["get"],
        "/api/v1/saved-vacancies/ids": ["get"],
        "/api/v1/saved-vacancies/{vacancy_id}": ["delete", "put"],
    }

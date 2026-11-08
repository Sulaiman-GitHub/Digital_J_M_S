"""Profile photos and company logos: upload, replace, delete, who may see what."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import UserImage, VacancyStatus, VerificationStatus
from tests.api.application_helpers import (
    BOSS,
    Scene,
    apply_to,
    make_scene,
    prepare_seeker,
    use_storage,
)
from tests.api.auth_helpers import PASSWORD, csrf_headers, error_code
from tests.api.profile_helpers import login_as
from tests.api.vacancy_helpers import make_company
from tests.sample_files import (
    PLAIN_TEXT,
    SVG,
    WINDOWS_EXE,
    make_jpeg,
    make_png,
    make_webp,
)

PHOTO = "/api/v1/photo/me"
LOGO = "/api/v1/logo/me"


@pytest.fixture
def scene(db_session: Session, tmp_path: Path) -> Scene:
    root = tmp_path / "storage"
    root.mkdir()
    return make_scene(db_session, root)


@pytest.fixture
def seeker(client: TestClient, scene: Scene) -> TestClient:
    use_storage(client, scene.storage_root)
    prepare_seeker(client, scene)
    return client


@pytest.fixture
def boss(client: TestClient, scene: Scene) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        use_storage(other, scene.storage_root)
        login_as(other, BOSS)
        yield other


@pytest.fixture
def rival(client: TestClient, scene: Scene, db_session: Session) -> Iterator[TestClient]:
    make_company(db_session, scene.world, email="rival@example.com", name="Rival Ltd")
    with TestClient(client.app, raise_server_exceptions=False) as other:
        use_storage(other, scene.storage_root)
        login_as(other, "rival@example.com")
        yield other


def send(
    client: TestClient,
    path: str,
    data: bytes,
    name: str = "me.png",
    content_type: str = "image/png",
    *,
    csrf: bool = True,
) -> Response:
    return client.post(
        path,
        files={"file": (name, data, content_type)},
        headers=csrf_headers(client) if csrf else {},
    )


def files(scene: Scene) -> set[str]:
    return {p.name for p in scene.storage_root.iterdir() if not p.name.startswith(".")}


def rows(db: Session, *, active_only: bool = True) -> int:
    query = select(func.count()).select_from(UserImage)
    if active_only:
        query = query.where(UserImage.deleted_at.is_(None))
    return db.scalar(query) or 0


# ---------- a job seeker's photo ----------


def test_a_job_seeker_uploads_a_photo_and_sees_it(seeker: TestClient) -> None:
    response = send(seeker, PHOTO, make_png())

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["content_type"] == "image/png"
    assert set(data) == {"content_type", "size_bytes", "created_at"}  # no key, no path
    assert seeker.get(PHOTO).json()["data"]["size_bytes"] == len(make_png())
    image = seeker.get(f"{PHOTO}/image")
    assert image.status_code == 200
    assert image.content == make_png()
    assert image.headers["content-type"] == "image/png"
    assert image.headers["x-content-type-options"] == "nosniff"
    assert image.headers["cache-control"] == "private, no-cache"


@pytest.mark.parametrize(
    ("data", "content_type"),
    [(make_png(), "image/png"), (make_jpeg(), "image/jpeg"), (make_webp(), "image/webp")],
)
def test_png_jpeg_and_webp_are_accepted_and_typed_by_their_bytes(
    seeker: TestClient, data: bytes, content_type: str
) -> None:
    # The name and the client's content type are lies; the bytes decide.
    response = send(seeker, PHOTO, data, name="holiday.exe", content_type="text/html")

    assert response.status_code == 201
    assert response.json()["data"]["content_type"] == content_type
    assert seeker.get(f"{PHOTO}/image").headers["content-type"] == content_type


@pytest.mark.parametrize("data", [SVG, PLAIN_TEXT, WINDOWS_EXE])
def test_other_files_are_refused(seeker: TestClient, data: bytes) -> None:
    response = send(seeker, PHOTO, data, name="pic.png")

    assert response.status_code == 415
    assert error_code(response) == "unsupported_file_type"
    assert seeker.get(PHOTO).status_code == 404


def test_an_empty_file_is_refused(seeker: TestClient) -> None:
    response = send(seeker, PHOTO, b"")

    assert response.status_code == 422
    assert error_code(response) == "file_empty"


def test_a_picture_over_the_limit_is_refused_before_it_is_stored(
    seeker: TestClient, scene: Scene, monkeypatch: pytest.MonkeyPatch
) -> None:
    changed = get_settings().model_copy(update={"max_image_bytes": 1000})
    monkeypatch.setattr("app.api.routes.images.get_settings", lambda: changed)
    monkeypatch.setattr("app.main.get_settings", lambda: changed)
    before = files(scene)

    response = send(seeker, PHOTO, make_png(pad_to=100_000))

    assert response.status_code == 413
    assert files(scene) == before


def test_replacing_keeps_one_active_photo_and_removes_the_old_file(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    before = files(scene)
    send(seeker, PHOTO, make_png())
    first = files(scene) - before

    assert send(seeker, PHOTO, make_jpeg()).status_code == 201

    db_session.expire_all()
    assert rows(db_session) == 1
    assert rows(db_session, active_only=False) == 2
    second = files(scene) - before
    assert len(second) == 1 and not (first & second)
    assert seeker.get(f"{PHOTO}/image").headers["content-type"] == "image/jpeg"


def test_deleting_the_photo_removes_it_and_the_file(seeker: TestClient, scene: Scene) -> None:
    before = files(scene)
    send(seeker, PHOTO, make_png())

    response = seeker.delete(PHOTO, headers=csrf_headers(seeker))

    assert response.status_code == 204
    assert seeker.get(PHOTO).status_code == 404
    assert seeker.get(f"{PHOTO}/image").status_code == 404
    assert files(scene) == before
    assert seeker.delete(PHOTO, headers=csrf_headers(seeker)).status_code == 404


def test_uploading_needs_login_and_csrf(client: TestClient, seeker: TestClient) -> None:
    assert send(seeker, PHOTO, make_png(), csrf=False).status_code == 403
    with TestClient(client.app, raise_server_exceptions=False) as anonymous:
        assert send(anonymous, PHOTO, make_png(), csrf=False).status_code == 401
        assert anonymous.get(PHOTO).status_code == 401
        assert anonymous.get(f"{PHOTO}/image").status_code == 401


def test_roles_are_kept_apart(seeker: TestClient, boss: TestClient) -> None:
    assert send(boss, PHOTO, make_png()).status_code == 403  # an employer has no photo
    assert send(seeker, LOGO, make_png()).status_code == 403  # a job seeker has no logo
    assert seeker.get(f"{LOGO}/image").status_code == 403
    assert boss.get(f"{PHOTO}/image").status_code == 403


# ---------- an employer's logo, and where the public sees it ----------


def test_an_employer_uploads_a_logo(boss: TestClient) -> None:
    response = send(boss, LOGO, make_png(), name="logo.png")

    assert response.status_code == 201
    assert boss.get(f"{LOGO}/image").content == make_png()
    assert boss.delete(LOGO, headers=csrf_headers(boss)).status_code == 204
    assert boss.get(LOGO).status_code == 404


def test_the_public_sees_the_logo_of_a_live_vacancy(
    client: TestClient, boss: TestClient, scene: Scene
) -> None:
    path = f"/api/v1/vacancies/{scene.vacancy.id}"
    with TestClient(client.app, raise_server_exceptions=False) as visitor:
        use_storage(visitor, scene.storage_root)
        card = visitor.get("/api/v1/vacancies").json()["data"][0]
        assert card["company_logo_url"] is None
        assert visitor.get(f"{path}/logo").status_code == 404

        send(boss, LOGO, make_png())

        card = visitor.get("/api/v1/vacancies").json()["data"][0]
        assert card["company_logo_url"] == f"{path}/logo"
        detail = visitor.get(path).json()["data"]
        assert detail["employer"]["logo_url"] == f"{path}/logo"
        logo = visitor.get(f"{path}/logo")
        assert logo.status_code == 200 and logo.content == make_png()
        assert logo.headers["content-type"] == "image/png"
        assert str(scene.company.id) not in str(card) + str(detail)  # the company id stays hidden


def test_the_logo_is_not_public_when_the_vacancy_or_company_is_not(
    client: TestClient, boss: TestClient, scene: Scene, db_session: Session
) -> None:
    send(boss, LOGO, make_png())
    path = f"/api/v1/vacancies/{scene.vacancy.id}/logo"
    with TestClient(client.app, raise_server_exceptions=False) as visitor:
        use_storage(visitor, scene.storage_root)
        assert visitor.get(path).status_code == 200

        scene.company.verification_status = VerificationStatus.SUSPENDED
        db_session.flush()
        assert visitor.get(path).status_code == 404

        scene.company.verification_status = VerificationStatus.APPROVED
        scene.vacancy.status = VacancyStatus.CLOSED
        db_session.flush()
        assert visitor.get(path).status_code == 404


# ---------- the applicant's photo, for the company they applied to ----------


def applied(seeker: TestClient, scene: Scene) -> str:
    response = apply_to(seeker, scene.vacancy.id)
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def test_the_employer_sees_the_photo_of_someone_who_applied(
    seeker: TestClient, boss: TestClient, scene: Scene
) -> None:
    send(seeker, PHOTO, make_png())
    application_id = applied(seeker, scene)

    response = boss.get(f"/api/v1/employer/applications/{application_id}/photo")

    assert response.status_code == 200
    assert response.content == make_png()
    assert response.headers["cache-control"] == "private, no-cache"


def test_another_company_cannot_see_the_photo(
    seeker: TestClient, rival: TestClient, scene: Scene
) -> None:
    send(seeker, PHOTO, make_png())
    application_id = applied(seeker, scene)

    response = rival.get(f"/api/v1/employer/applications/{application_id}/photo")

    assert response.status_code == 404


def test_a_job_seeker_cannot_use_the_employer_photo_route(
    seeker: TestClient, scene: Scene
) -> None:
    send(seeker, PHOTO, make_png())
    application_id = applied(seeker, scene)

    assert seeker.get(f"/api/v1/employer/applications/{application_id}/photo").status_code == 403


def test_an_applicant_without_a_photo_is_a_404(
    seeker: TestClient, boss: TestClient, scene: Scene
) -> None:
    application_id = applied(seeker, scene)

    response = boss.get(f"/api/v1/employer/applications/{application_id}/photo")

    assert response.status_code == 404
    assert error_code(response) == "photo_not_found"


def test_the_photo_shown_is_the_current_one(
    seeker: TestClient, boss: TestClient, scene: Scene
) -> None:
    send(seeker, PHOTO, make_png())
    application_id = applied(seeker, scene)
    send(seeker, PHOTO, make_jpeg())

    response = boss.get(f"/api/v1/employer/applications/{application_id}/photo")

    assert response.content == make_jpeg()


# ---------- account deletion and export ----------


def test_the_export_lists_the_photo_and_deleting_the_account_removes_it(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    send(seeker, PHOTO, make_png())

    exported = seeker.get("/api/v1/account/export").json()["data"]
    assert exported["photo"]["download"] == "/api/v1/photo/me/image"
    assert "storage_key" not in exported["photo"]

    response = seeker.request(
        "DELETE",
        "/api/v1/account",
        json={"password": PASSWORD},
        headers=csrf_headers(seeker),
    )

    assert response.status_code == 204
    db_session.expire_all()
    assert rows(db_session, active_only=False) == 0
    assert files(scene) == set()  # the photo and the CV are both gone


def test_an_employer_export_lists_the_logo(boss: TestClient) -> None:
    send(boss, LOGO, make_png())

    exported = boss.get("/api/v1/account/export").json()["data"]

    assert exported["logo"]["download"] == "/api/v1/logo/me/image"


def test_the_openapi_lists_the_image_operations(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert {
        path: sorted(methods)
        for path, methods in paths.items()
        if {"photo", "logo"} & set(path.split("/"))
    } == {
        "/api/v1/photo/me": ["delete", "get", "post"],
        "/api/v1/photo/me/image": ["get"],
        "/api/v1/logo/me": ["delete", "get", "post"],
        "/api/v1/logo/me/image": ["get"],
        "/api/v1/vacancies/{vacancy_id}/logo": ["get"],
        "/api/v1/employer/applications/{application_id}/photo": ["get"],
    }

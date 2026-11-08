"""CV API: upload, replace, download, delete, permissions, ownership."""

import hashlib
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import file_storage
from app.core.config import Settings, get_settings
from app.integrations.storage import LocalFileStorage, StorageError
from app.models import Cv, UserRole, UserStatus
from app.services import cvs as cv_service
from tests.api.auth_helpers import (
    csrf_headers,
    error_code,
    register_and_login,
    set_status,
)
from tests.api.cv_helpers import (
    CV,
    DOC_TYPE,
    DOCX_TYPE,
    DOWNLOAD,
    PDF_TYPE,
    error_shape_ok,
    stored_files,
    upload,
)
from tests.api.profile_helpers import create_user, login_as
from tests.sample_files import (
    PLAIN_TEXT,
    WINDOWS_EXE,
    make_doc,
    make_docx,
    make_pdf,
)


@pytest.fixture
def storage_root(tmp_path: Path) -> Path:
    root = tmp_path / "storage"
    root.mkdir()
    return root


@pytest.fixture(autouse=True)
def isolated_storage(client: TestClient, storage_root: Path) -> None:
    client.app.dependency_overrides[file_storage] = lambda: LocalFileStorage(storage_root)


@pytest.fixture
def seeker(client: TestClient) -> TestClient:
    register_and_login(client, "nakato@example.com")  # email NOT verified: uploads are allowed
    return client


@pytest.fixture
def second_client(client: TestClient) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        yield other


def small_limit(monkeypatch: pytest.MonkeyPatch, limit: int) -> None:
    changed = get_settings().model_copy(update={"max_cv_bytes": limit})
    monkeypatch.setattr("app.api.routes.cv.get_settings", lambda: changed)
    monkeypatch.setattr("app.main.get_settings", lambda: changed)


def count_rows(db: Session, *, active_only: bool = False) -> int:
    query = select(func.count()).select_from(Cv)
    if active_only:
        query = query.where(Cv.deleted_at.is_(None))
    return db.scalar(query) or 0


# ---------- upload ----------


@pytest.mark.parametrize(
    ("name", "data", "content_type"),
    [
        ("cv.pdf", make_pdf(), PDF_TYPE),
        ("cv.docx", make_docx(), DOCX_TYPE),
        ("cv.doc", make_doc(), DOC_TYPE),
        ("CV.PDF", make_pdf(), PDF_TYPE),
    ],
)
def test_valid_files_are_accepted(
    seeker: TestClient, name: str, data: bytes, content_type: str, storage_root: Path
) -> None:
    response = upload(seeker, name, data)

    assert response.status_code == 201, response.text
    body = response.json()["data"]
    assert set(body) == {"id", "original_filename", "content_type", "size_bytes", "created_at"}
    assert body["content_type"] == content_type
    assert body["size_bytes"] == len(data)
    assert body["original_filename"].lower() == name.lower()
    assert len(stored_files(storage_root)) == 1


def test_the_type_comes_from_the_server_not_the_client(seeker: TestClient) -> None:
    response = upload(seeker, "cv.pdf", make_pdf(), content_type="text/html")

    assert response.status_code == 201
    assert response.json()["data"]["content_type"] == PDF_TYPE


def test_the_file_is_stored_under_a_random_key_and_hashed(
    seeker: TestClient, db_session: Session, storage_root: Path
) -> None:
    data = make_pdf()
    upload(seeker, "Nakato Sarah CV.pdf", data)

    (path,) = stored_files(storage_root)
    assert len(path.name) == 32 and "nakato" not in path.name.lower()
    assert path.read_bytes() == data
    cv = db_session.scalars(select(Cv)).one()
    assert cv.storage_key == path.name
    assert cv.sha256 == hashlib.sha256(data).hexdigest()
    assert cv.original_filename == "Nakato Sarah CV.pdf"


def test_the_storage_path_is_never_exposed(seeker: TestClient, storage_root: Path) -> None:
    upload_response = upload(seeker, "cv.pdf", make_pdf())
    me = seeker.get(CV)

    for text in (upload_response.text, me.text):
        assert str(storage_root) not in text
        assert "storage_key" not in text
        assert "sha256" not in text
    assert "storage" not in str(me.headers).lower()


@pytest.mark.parametrize("name", ["cv.exe", "notes.txt", "cv", "cv.pdf.exe", "cv.zip", ".pdf"])
def test_unsupported_extensions_are_415(
    seeker: TestClient, name: str, db_session: Session, storage_root: Path
) -> None:
    response = upload(seeker, name, make_pdf())

    assert response.status_code == 415
    assert error_code(response) == "unsupported_file_type"
    assert error_shape_ok(response)
    assert count_rows(db_session) == 0
    assert stored_files(storage_root) == []


def test_a_renamed_exe_is_refused(seeker: TestClient, storage_root: Path) -> None:
    response = upload(seeker, "cv.pdf", WINDOWS_EXE, content_type=PDF_TYPE)

    assert response.status_code == 415
    assert error_code(response) == "file_type_mismatch"
    assert stored_files(storage_root) == []


@pytest.mark.parametrize(
    ("name", "data"),
    [
        ("cv.pdf", PLAIN_TEXT),
        ("cv.pdf", make_docx()),
        ("cv.docx", make_pdf()),
        ("cv.doc", make_pdf()),
        ("cv.docx", WINDOWS_EXE),
    ],
)
def test_wrong_magic_bytes_are_refused(
    seeker: TestClient, name: str, data: bytes, storage_root: Path
) -> None:
    response = upload(seeker, name, data)

    assert response.status_code == 415
    assert error_code(response) == "file_type_mismatch"
    assert error_shape_ok(response)
    assert stored_files(storage_root) == []


def test_an_empty_file_is_422(seeker: TestClient, storage_root: Path) -> None:
    response = upload(seeker, "cv.pdf", b"")

    assert response.status_code == 422
    assert error_code(response) == "file_empty"
    assert stored_files(storage_root) == []


def test_a_blank_file_name_means_no_file_was_chosen(seeker: TestClient) -> None:
    response = upload(seeker, "", make_pdf())

    assert response.status_code == 422
    assert error_shape_ok(response)


def test_a_missing_file_field_is_422(seeker: TestClient) -> None:
    response = seeker.post(CV, data={"other": "x"}, headers=csrf_headers(seeker))

    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert error_shape_ok(response)


def test_an_oversize_file_is_413(
    seeker: TestClient, monkeypatch: pytest.MonkeyPatch, storage_root: Path
) -> None:
    small_limit(monkeypatch, 1000)

    response = upload(seeker, "cv.pdf", make_pdf(pad_to=1001))

    assert response.status_code == 413
    assert error_code(response) == "file_too_large"
    assert error_shape_ok(response)
    assert stored_files(storage_root) == []


def test_a_file_exactly_at_the_limit_is_accepted(
    seeker: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    small_limit(monkeypatch, 1000)

    response = upload(seeker, "cv.pdf", make_pdf(pad_to=1000))

    assert response.status_code == 201
    assert response.json()["data"]["size_bytes"] == 1000


def test_a_huge_declared_length_is_refused_before_the_body_is_read(
    seeker: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    small_limit(monkeypatch, 1000)

    response = seeker.post(
        CV,
        content=b"tiny",
        headers={
            **csrf_headers(seeker),
            "Content-Type": "multipart/form-data; boundary=x",
            "Content-Length": str(10 * 1024 * 1024),
        },
    )

    assert response.status_code == 413
    assert error_code(response) == "file_too_large"
    assert "x-request-id" in response.headers


def test_a_hostile_filename_is_neutralised(
    seeker: TestClient, storage_root: Path, tmp_path: Path
) -> None:
    response = upload(seeker, "../../../etc/passwd.pdf", make_pdf())

    assert response.status_code == 201
    assert response.json()["data"]["original_filename"] == "passwd.pdf"
    assert [p.name for p in stored_files(storage_root)] != ["passwd.pdf"]
    assert {p.name for p in tmp_path.iterdir()} == {"storage"}  # nothing escaped the folder


def test_a_disguised_extension_is_not_trusted(seeker: TestClient) -> None:
    # Right-to-left override: shown as "cvfdp.exe" once cleaned, so it is refused.
    response = upload(seeker, "cv‮fdp.exe", make_pdf())

    assert response.status_code == 415


# ---------- replace ----------


def test_a_second_upload_replaces_the_first(
    seeker: TestClient, db_session: Session, storage_root: Path
) -> None:
    upload(seeker, "first.pdf", make_pdf())
    (first_path,) = stored_files(storage_root)

    second = upload(seeker, "second.docx", make_docx())

    assert second.status_code == 201
    assert count_rows(db_session) == 2  # the old row is kept, soft-deleted
    assert count_rows(db_session, active_only=True) == 1
    (remaining,) = stored_files(storage_root)
    assert remaining != first_path and not first_path.exists()
    assert seeker.get(CV).json()["data"]["original_filename"] == "second.docx"
    assert seeker.get(DOWNLOAD).content == make_docx()


def test_a_refused_replacement_leaves_the_old_cv_alone(
    seeker: TestClient, storage_root: Path
) -> None:
    upload(seeker, "first.pdf", make_pdf())
    before = stored_files(storage_root)

    assert upload(seeker, "bad.pdf", WINDOWS_EXE).status_code == 415

    assert stored_files(storage_root) == before
    assert seeker.get(CV).json()["data"]["original_filename"] == "first.pdf"
    assert seeker.get(DOWNLOAD).content == make_pdf()


# ---------- read and download ----------


def test_no_cv_yet_is_404(seeker: TestClient) -> None:
    for path in (CV, DOWNLOAD):
        response = seeker.get(path)
        assert response.status_code == 404
        assert error_code(response) == "cv_not_found"
        assert error_shape_ok(response)


def test_the_download_returns_the_exact_bytes_with_safe_headers(seeker: TestClient) -> None:
    data = make_pdf(pad_to=200_000)  # several chunks
    upload(seeker, "Nakato CV.pdf", data)

    response = seeker.get(DOWNLOAD)

    assert response.status_code == 200
    assert response.content == data
    assert response.headers["content-type"] == PDF_TYPE
    assert response.headers["content-length"] == str(len(data))
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["cache-control"] == "private, no-store"
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    assert 'filename="Nakato CV.pdf"' in disposition


def test_a_unicode_name_gives_a_safe_content_disposition(seeker: TestClient) -> None:
    upload(seeker, "Résumé 简历.pdf", make_pdf())

    disposition = seeker.get(DOWNLOAD).headers["content-disposition"]

    assert disposition.startswith("attachment;")
    assert "filename*=UTF-8''R%C3%A9sum%C3%A9%20%E7%AE%80%E5%8E%86.pdf" in disposition
    assert disposition.isascii()
    assert "\n" not in disposition and "\r" not in disposition


def test_a_missing_file_on_disk_is_404_with_its_own_code(
    seeker: TestClient, storage_root: Path
) -> None:
    upload(seeker, "cv.pdf", make_pdf())
    for path in stored_files(storage_root):
        path.unlink()

    response = seeker.get(DOWNLOAD)

    assert response.status_code == 404
    assert error_code(response) == "cv_file_missing"
    assert error_shape_ok(response)


# ---------- delete ----------


def test_delete_removes_the_row_and_the_file(
    seeker: TestClient, db_session: Session, storage_root: Path
) -> None:
    upload(seeker, "cv.pdf", make_pdf())

    response = seeker.delete(CV, headers=csrf_headers(seeker))

    assert response.status_code == 204
    assert response.content == b""
    assert stored_files(storage_root) == []
    assert count_rows(db_session, active_only=True) == 0
    assert seeker.get(CV).status_code == 404
    assert seeker.get(DOWNLOAD).status_code == 404


def test_deleting_with_no_cv_is_404(seeker: TestClient) -> None:
    response = seeker.delete(CV, headers=csrf_headers(seeker))

    assert response.status_code == 404
    assert error_code(response) == "cv_not_found"


def test_a_new_cv_can_be_uploaded_after_deleting(seeker: TestClient) -> None:
    upload(seeker, "one.pdf", make_pdf())
    seeker.delete(CV, headers=csrf_headers(seeker))

    assert upload(seeker, "two.pdf", make_pdf()).status_code == 201


# ---------- permissions ----------


def test_anonymous_requests_are_401(client: TestClient) -> None:
    responses = [
        client.get(CV),
        client.get(DOWNLOAD),
        client.post(CV, files={"file": ("cv.pdf", make_pdf(), PDF_TYPE)}),
        client.delete(CV),
    ]

    for response in responses:
        assert response.status_code == 401
        assert error_code(response) == "not_authenticated"
        assert error_shape_ok(response)


@pytest.mark.parametrize("role", [UserRole.EMPLOYER, UserRole.ADMIN])
def test_other_roles_are_403(
    client: TestClient, db_session: Session, role: UserRole, storage_root: Path
) -> None:
    create_user(db_session, "other@example.com", role)
    login_as(client, "other@example.com")

    responses = [
        client.get(CV),
        client.get(DOWNLOAD),
        upload(client, "cv.pdf", make_pdf()),
        client.delete(CV, headers=csrf_headers(client)),
    ]

    for response in responses:
        assert response.status_code == 403
        assert error_shape_ok(response)
    assert stored_files(storage_root) == []


def test_upload_and_delete_need_the_csrf_header(seeker: TestClient, storage_root: Path) -> None:
    refused_upload = upload(seeker, "cv.pdf", make_pdf(), csrf=False)
    upload(seeker, "cv.pdf", make_pdf())
    refused_delete = seeker.delete(CV)

    assert refused_upload.status_code == 403
    assert refused_delete.status_code == 403
    assert error_shape_ok(refused_upload)
    assert len(stored_files(storage_root)) == 1  # the delete did nothing


def test_a_suspended_user_is_refused(
    seeker: TestClient, db_session: Session, storage_root: Path
) -> None:
    upload(seeker, "cv.pdf", make_pdf())
    set_status(db_session, "nakato@example.com", UserStatus.SUSPENDED)
    db_session.commit()  # a refused request rolls back anything unsaved

    assert seeker.get(CV).status_code == 401
    assert seeker.get(DOWNLOAD).status_code == 401


def test_another_seeker_cannot_see_or_touch_my_cv(
    seeker: TestClient, second_client: TestClient, storage_root: Path
) -> None:
    upload(seeker, "private.pdf", make_pdf())
    register_and_login(second_client, "okello@example.com")

    for response in (second_client.get(CV), second_client.get(DOWNLOAD)):
        assert response.status_code == 404
        assert error_code(response) == "cv_not_found"
    assert second_client.delete(CV, headers=csrf_headers(second_client)).status_code == 404

    # their own upload does not disturb mine
    assert upload(second_client, "theirs.docx", make_docx()).status_code == 201
    assert seeker.get(CV).json()["data"]["original_filename"] == "private.pdf"
    assert seeker.get(DOWNLOAD).content == make_pdf()
    assert second_client.get(DOWNLOAD).content == make_docx()
    assert len(stored_files(storage_root)) == 2


def test_an_unverified_email_may_upload(seeker: TestClient) -> None:
    assert upload(seeker, "cv.pdf", make_pdf()).status_code == 201


# ---------- rate limit ----------


def test_uploads_are_rate_limited(seeker: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    limited: Settings = get_settings().model_copy(update={"upload_rate_limit": "2/minute"})
    monkeypatch.setattr("app.core.rate_limit.get_settings", lambda: limited)

    assert upload(seeker, "cv.pdf", make_pdf()).status_code == 201
    assert upload(seeker, "cv.pdf", make_pdf()).status_code == 201
    response = upload(seeker, "cv.pdf", make_pdf())

    assert response.status_code == 429
    assert error_code(response) == "rate_limited"
    assert seeker.get(CV).status_code == 200  # reading is not limited


# ---------- failures leave nothing behind ----------


def test_a_database_failure_after_saving_removes_the_new_file_and_keeps_the_old_cv(
    seeker: TestClient, monkeypatch: pytest.MonkeyPatch, storage_root: Path
) -> None:
    upload(seeker, "old.pdf", make_pdf())
    before = stored_files(storage_root)

    def explode(*args: Any, **kwargs: Any) -> None:
        raise RuntimeError("database went away")

    monkeypatch.setattr(Session, "add", explode)
    response = upload(seeker, "new.docx", make_docx())
    monkeypatch.undo()

    assert response.status_code == 500
    assert error_shape_ok(response)
    assert "database went away" not in response.text
    assert stored_files(storage_root) == before
    assert seeker.get(CV).json()["data"]["original_filename"] == "old.pdf"


def test_a_key_collision_is_409_and_the_other_cv_is_untouched(
    seeker: TestClient,
    second_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    storage_root: Path,
) -> None:
    # Practically impossible with random keys; forced here to exercise the unique constraint.
    upload(seeker, "mine.pdf", make_pdf())
    (taken,) = [p.name for p in stored_files(storage_root)]
    register_and_login(second_client, "okello@example.com")
    monkeypatch.setattr(cv_service, "new_key", lambda: taken)

    response = upload(second_client, "theirs.pdf", make_pdf())
    monkeypatch.undo()

    assert response.status_code == 409
    assert error_code(response) == "cv_upload_conflict"
    assert error_shape_ok(response)
    assert second_client.get(CV).status_code == 404


def test_a_storage_failure_is_503(
    seeker: TestClient, client: TestClient, storage_root: Path
) -> None:
    class BrokenStorage(LocalFileStorage):
        def save(self, key: str, stream: Any) -> int:
            raise StorageError("disk full")

    client.app.dependency_overrides[file_storage] = lambda: BrokenStorage(storage_root)

    response = upload(seeker, "cv.pdf", make_pdf())

    assert response.status_code == 503
    assert error_code(response) == "storage_unavailable"
    assert error_shape_ok(response)
    assert "disk full" not in response.text


# ---------- documentation ----------


def test_openapi_lists_only_the_own_cv_paths(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    cv_paths = {
        path: sorted(methods) for path, methods in paths.items() if path.startswith("/api/v1/cv")
    }

    assert cv_paths == {
        "/api/v1/cv/me": ["delete", "get", "post"],
        "/api/v1/cv/me/download": ["get"],
    }

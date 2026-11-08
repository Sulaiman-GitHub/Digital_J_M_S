"""The upload size limit refuses early, for one path and method only."""

from collections.abc import Iterator

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.core.errors import register_exception_handlers
from app.core.upload_limit import MULTIPART_OVERHEAD_BYTES, UploadSizeLimitMiddleware

LIMIT = 1000


@pytest.fixture
def seen() -> list[int]:
    return []


@pytest.fixture
def client(seen: list[int]) -> TestClient:
    app = FastAPI()
    register_exception_handlers(app)
    app.add_middleware(
        UploadSizeLimitMiddleware, path="/upload", method="POST", max_file_bytes=lambda: LIMIT
    )

    @app.post("/upload")
    async def upload(request: Request) -> dict[str, int]:
        size = len(await request.body())
        seen.append(size)
        return {"size": size}

    @app.post("/other")
    async def other(request: Request) -> dict[str, int]:
        return {"size": len(await request.body())}

    @app.get("/upload")
    def read() -> dict[str, str]:
        return {"ok": "yes"}

    return TestClient(app, raise_server_exceptions=False)


def chunks(total: int, size: int = 200) -> Iterator[bytes]:
    sent = 0
    while sent < total:
        piece = min(size, total - sent)
        yield b"x" * piece
        sent += piece


def test_a_body_within_the_limit_is_accepted(client: TestClient, seen: list[int]) -> None:
    response = client.post("/upload", content=b"x" * LIMIT)

    assert response.status_code == 200
    assert seen == [LIMIT]


def test_the_form_overhead_is_allowed_on_top_of_the_file_limit(
    client: TestClient, seen: list[int]
) -> None:
    ok = client.post("/upload", content=b"x" * (LIMIT + MULTIPART_OVERHEAD_BYTES))

    assert ok.status_code == 200


def test_a_declared_length_over_the_limit_is_refused_before_anything_is_read(
    client: TestClient, seen: list[int]
) -> None:
    response = client.post(
        "/upload",
        content=b"tiny",
        headers={"Content-Length": str(LIMIT + MULTIPART_OVERHEAD_BYTES + 1)},
    )

    assert response.status_code == 413
    assert response.json() == {
        "error": {
            "code": "file_too_large",
            "message": "This file is too big. The limit is 0.000953674 MB.",
            "details": None,
        }
    }
    assert seen == []  # the route never ran


def test_an_upload_with_no_declared_length_is_counted_and_stopped(
    client: TestClient, seen: list[int]
) -> None:
    response = client.post("/upload", content=chunks(LIMIT + MULTIPART_OVERHEAD_BYTES + 5000))

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"
    assert seen == []


def test_a_chunked_upload_within_the_limit_is_fine(client: TestClient, seen: list[int]) -> None:
    response = client.post("/upload", content=chunks(LIMIT))

    assert response.status_code == 200
    assert seen == [LIMIT]


def test_other_paths_and_methods_are_not_limited(client: TestClient) -> None:
    big = b"x" * (LIMIT * 100)

    assert client.post("/other", content=big).status_code == 200
    assert client.get("/upload").status_code == 200


def test_a_garbage_content_length_is_ignored_not_a_crash(client: TestClient) -> None:
    response = client.post("/upload", content=b"x", headers={"Content-Length": "abc"})

    assert response.status_code in {200, 400}  # the server layer decides; never a 500
    assert response.status_code != 500

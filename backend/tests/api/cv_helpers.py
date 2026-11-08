"""Helpers for CV tests."""

from pathlib import Path

from fastapi.testclient import TestClient
from httpx import Response

from tests.api.auth_helpers import csrf_headers

CV = "/api/v1/cv/me"
DOWNLOAD = "/api/v1/cv/me/download"

PDF_TYPE = "application/pdf"
DOC_TYPE = "application/msword"
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def upload(
    client: TestClient,
    name: str,
    data: bytes,
    content_type: str = "application/octet-stream",
    *,
    csrf: bool = True,
) -> Response:
    return client.post(
        CV,
        files={"file": (name, data, content_type)},
        headers=csrf_headers(client) if csrf else {},
    )


def stored_files(root: Path) -> list[Path]:
    """Every file in the storage folder, including any leftover temporary file."""
    return sorted(p for p in root.iterdir())


def error_shape_ok(response: Response) -> bool:
    body = response.json()
    return set(body) == {"error"} and set(body["error"]) == {"code", "message", "details"}

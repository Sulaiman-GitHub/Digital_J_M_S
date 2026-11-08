"""Hardening: security headers, body size limit, docs off in production, and
the extra rate limits."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app import main as main_module
from app.core.config import Settings, get_settings
from app.db.session import get_db
from tests.api.application_helpers import (
    Scene,
    apply_to,
    make_scene,
    prepare_seeker,
    use_storage,
)
from tests.api.auth_helpers import csrf_headers, error_code

SECURITY_HEADERS = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
}


def test_every_response_carries_the_security_headers(client: TestClient) -> None:
    for response in (
        client.get("/api/v1/health"),
        client.get("/api/v1/nothing-here"),  # an error response
        client.get("/api/v1/auth/me"),  # a 401
    ):
        for name, value in SECURITY_HEADERS.items():
            assert response.headers[name] == value
        assert response.headers["content-security-policy"] == (
            "default-src 'none'; frame-ancestors 'none'"
        )
        assert "permissions-policy" in response.headers
        assert "strict-transport-security" not in response.headers  # not production


def test_the_docs_page_is_not_given_the_api_policy(client: TestClient) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    assert "content-security-policy" not in response.headers
    assert response.headers["x-content-type-options"] == "nosniff"


def _production_app(monkeypatch: pytest.MonkeyPatch, db: Session) -> TestClient:
    settings = Settings(
        _env_file=None,
        app_env="production",
        secret_key="x" * 40,
        database_url="postgresql+psycopg://u:p@localhost:5432/real",
        email_backend="smtp",
        smtp_host="smtp.example.com",
    )  # type: ignore[arg-type]
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    app = main_module.create_app()

    def override_get_db() -> Iterator[Session]:
        yield db

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app, raise_server_exceptions=False)


def test_production_sends_hsts_and_publishes_no_docs(
    monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    client = _production_app(monkeypatch, db_session)

    health = client.get("/api/v1/health")

    assert health.headers["strict-transport-security"].startswith("max-age=")
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_large_json_bodies_are_refused_before_they_are_read(client: TestClient) -> None:
    body = {"email": "a@example.com", "password": "x" * (2 * 1024 * 1024)}

    response = client.post("/api/v1/auth/login", json=body)

    assert response.status_code == 413
    assert error_code(response) == "payload_too_large"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_a_body_without_a_declared_length_is_counted(client: TestClient) -> None:
    def chunks() -> Iterator[bytes]:
        for _ in range(3):
            yield b" " * (600 * 1024)

    response = client.post(
        "/api/v1/auth/login", content=chunks(), headers={"content-type": "application/json"}
    )

    assert response.status_code == 413


def test_normal_requests_are_not_affected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "Kampala-Sunrise-42"}
    )

    assert response.status_code == 401


@pytest.mark.parametrize("path", ["/api/v1/auth/verify-email", "/api/v1/auth/reset-password"])
def test_token_endpoints_are_rate_limited(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, path: str
) -> None:
    limited = get_settings().model_copy(update={"auth_rate_limit": "2/minute"})
    monkeypatch.setattr("app.core.rate_limit.get_settings", lambda: limited)
    body = {"token": "nonsense"} if "verify" in path else {"token": "x", "new_password": "x"}

    statuses = [client.post(path, json=body).status_code for _ in range(3)]

    assert statuses[-1] == 429
    assert 429 not in statuses[:2]


def test_applying_is_rate_limited(
    client: TestClient, db_session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "storage"
    root.mkdir()
    scene: Scene = make_scene(db_session, root)
    use_storage(client, root)
    prepare_seeker(client, scene)
    limited = get_settings().model_copy(update={"apply_rate_limit": "1/hour"})
    monkeypatch.setattr("app.core.rate_limit.get_settings", lambda: limited)
    first = apply_to(client, scene.vacancy.id)

    second = client.post(
        f"/api/v1/vacancies/{scene.vacancy.id}/applications",
        json={},
        headers=csrf_headers(client),
    )

    assert first.status_code == 201
    assert second.status_code == 429
    assert error_code(second) == "rate_limited"

from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db.session import get_db


def test_health_reports_api_and_database_ok(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"data": {"status": "ok", "database": "ok"}}


def test_health_returns_503_envelope_when_database_fails(client: TestClient) -> None:
    class BrokenSession:
        def execute(self, *args: object, **kwargs: object) -> None:
            raise OperationalError(
                "SELECT 1", {}, Exception("connection refused for password=hunter2")
            )

        def commit(self) -> None: ...
        def rollback(self) -> None: ...

    def broken_db() -> Iterator[BrokenSession]:
        yield BrokenSession()

    client.app.dependency_overrides[get_db] = broken_db  # type: ignore[attr-defined]

    response = client.get("/api/v1/health")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert "hunter2" not in response.text
    assert "connection refused" not in response.text
    assert "x-request-id" in response.headers


def test_every_response_has_a_request_id(client: TestClient) -> None:
    first = client.get("/api/v1/health").headers.get("x-request-id")
    second = client.get("/api/v1/health").headers.get("x-request-id")

    assert first and second
    assert first != second


def test_client_supplied_request_id_is_ignored(client: TestClient) -> None:
    response = client.get("/api/v1/health", headers={"X-Request-ID": "client-chosen-id"})

    assert response.headers["x-request-id"] != "client-chosen-id"


def test_unknown_route_returns_error_envelope(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert set(body["error"]) == {"code", "message", "details"}
    assert "x-request-id" in response.headers


def test_wrong_method_returns_error_envelope(client: TestClient) -> None:
    response = client.post("/api/v1/health")

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "method_not_allowed"

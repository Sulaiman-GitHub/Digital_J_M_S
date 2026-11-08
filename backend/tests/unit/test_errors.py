import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import GENERIC_500_MESSAGE, AppError, register_exception_handlers
from app.core.logging import RequestIdMiddleware


def _make_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestIdMiddleware)
    register_exception_handlers(app)

    @app.get("/app-error")
    def app_error() -> None:
        raise AppError(
            "vacancy_not_publishable",
            "Your employer account is not verified yet.",
            status=409,
        )

    @app.get("/app-error-details")
    def app_error_details() -> None:
        raise AppError("bad_input", "Check the form.", details={"fields": {"email": "Taken"}})

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("database password is hunter2")

    @app.get("/items/{item_id}")
    def item(item_id: int, page: int = 1) -> dict[str, int]:
        return {"item_id": item_id, "page": page}

    return app


@pytest.fixture
def client() -> TestClient:
    return TestClient(_make_app(), raise_server_exceptions=False)


def test_app_error_uses_envelope_and_status(client: TestClient) -> None:
    response = client.get("/app-error")

    assert response.status_code == 409
    assert response.json() == {
        "error": {
            "code": "vacancy_not_publishable",
            "message": "Your employer account is not verified yet.",
            "details": None,
        }
    }


def test_app_error_defaults_to_400_and_keeps_details(client: TestClient) -> None:
    response = client.get("/app-error-details")

    assert response.status_code == 400
    assert response.json()["error"]["details"] == {"fields": {"email": "Taken"}}


def test_validation_error_lists_fields(client: TestClient) -> None:
    response = client.get("/items/abc", params={"page": "x"})

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert set(error["details"]["fields"]) == {"item_id", "page"}


def test_unexpected_error_is_generic_and_hides_internals(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR, logger="app"):
        response = client.get("/boom")

    assert response.status_code == 500
    error = response.json()["error"]
    assert error["code"] == "internal_error"
    assert error["message"] == GENERIC_500_MESSAGE
    assert "hunter2" not in response.text
    assert "Traceback" not in response.text

    # Request id is in both the body and the header, and they match.
    request_id = response.headers["x-request-id"]
    assert error["details"] == {"request_id": request_id}

    # The error was logged with the same request id.
    records = [r for r in caplog.records if r.name == "app.errors"]
    assert records
    assert records[0].request_id == request_id

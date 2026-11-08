import pytest
from fastapi.testclient import TestClient

from tests.api.auth_helpers import AUTH, PASSWORD, error_code


@pytest.mark.parametrize(
    ("path", "body"),
    [
        (
            "/register",
            {
                "email": "x@example.com",
                "password": "short",
                "role": "job_seeker",
                "accept_terms": True,
            },
        ),
        ("/login", {"email": "x@example.com", "password": PASSWORD}),
        ("/forgot-password", {"email": "x@example.com"}),
    ],
)
def test_sixth_request_in_a_minute_from_one_ip_is_429(
    client: TestClient, path: str, body: dict[str, str]
) -> None:
    for _ in range(5):
        assert client.post(f"{AUTH}{path}", json=body).status_code != 429

    response = client.post(f"{AUTH}{path}", json=body)

    assert response.status_code == 429
    assert error_code(response) == "rate_limited"
    assert response.headers["Retry-After"] == "60"
    assert "x-request-id" in response.headers


def test_limits_are_counted_per_endpoint(client: TestClient) -> None:
    for _ in range(5):
        client.post(f"{AUTH}/forgot-password", json={"email": "x@example.com"})

    assert (
        client.post(
            f"{AUTH}/login", json={"email": "x@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )


def test_the_limit_comes_from_the_auth_rate_limit_setting(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core import rate_limit
    from app.core.config import Settings

    monkeypatch.setattr(
        rate_limit,
        "get_settings",
        lambda: Settings(_env_file=None, auth_rate_limit="2/minute"),  # type: ignore[call-arg]
    )
    body = {"email": "x@example.com", "password": PASSWORD}

    statuses = [client.post(f"{AUTH}/login", json=body).status_code for _ in range(3)]

    assert statuses == [401, 401, 429]

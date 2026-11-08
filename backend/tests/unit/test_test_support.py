"""The test-only inbox endpoint exists only when APP_ENV=test."""

import pytest
from fastapi.testclient import TestClient

from app import main as main_module
from app.api.routes import test_support as test_support_module
from app.core.config import Settings
from app.integrations.email import EmailMessage, get_email_sender, get_test_outbox

TEST_DB = "postgresql+psycopg://u:p@localhost:5432/anything_test"
REAL_DB = "postgresql+psycopg://djm_user:real-password@db:5432/djm"


def _settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[arg-type]


def _client(monkeypatch: pytest.MonkeyPatch, settings: Settings) -> TestClient:
    monkeypatch.setattr(main_module, "get_settings", lambda: settings)
    monkeypatch.setattr(test_support_module, "get_settings", lambda: settings)
    return TestClient(main_module.create_app(), raise_server_exceptions=False)


@pytest.fixture(autouse=True)
def empty_outbox() -> None:
    get_test_outbox().sent.clear()


def test_inbox_lists_what_the_app_sent_in_test_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(monkeypatch, _settings(app_env="test", test_database_url=TEST_DB))
    sender = get_email_sender(_settings(app_env="test", test_database_url=TEST_DB))
    sender.send("nakato@example.com", "Confirm your email address", "Open: http://x/y?token=abc")
    sender.send("okello@example.com", "Reset your password", "Open: http://x/z?token=def")

    everything = client.get("/api/v1/_test/emails").json()["data"]
    filtered = client.get("/api/v1/_test/emails", params={"to": " NAKATO@Example.com "}).json()

    assert [m["to"] for m in everything] == ["nakato@example.com", "okello@example.com"]
    assert [m["subject"] for m in filtered["data"]] == ["Confirm your email address"]
    assert "token=abc" in filtered["data"][0]["text_body"]


def test_inbox_can_be_cleared(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(monkeypatch, _settings(app_env="test", test_database_url=TEST_DB))
    get_test_outbox().send("a@example.com", "Hi", "text")

    assert client.delete("/api/v1/_test/emails").status_code == 204

    assert client.get("/api/v1/_test/emails").json() == {"data": []}


@pytest.mark.parametrize(
    "settings",
    [
        _settings(app_env="development"),
        _settings(
            app_env="production",
            secret_key="x" * 40,
            database_url=REAL_DB,
            email_backend="smtp",
            smtp_host="smtp.example.com",
        ),
    ],
    ids=["development", "production"],
)
def test_inbox_does_not_exist_outside_the_test_environment(
    monkeypatch: pytest.MonkeyPatch, settings: Settings
) -> None:
    get_test_outbox().send("a@example.com", "Hi", "secret link")
    client = _client(monkeypatch, settings)

    for method in ("get", "delete"):
        response = getattr(client, method)("/api/v1/_test/emails")
        assert response.status_code == 404, method
        assert "secret link" not in response.text
    assert get_test_outbox().sent  # and nothing was cleared


def test_each_route_refuses_to_run_outside_test_even_if_registered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Defence in depth: a wiring mistake must not expose the inbox."""
    app = main_module.create_app()
    app.include_router(test_support_module.router, prefix="/api/v1")  # registered by mistake
    monkeypatch.setattr(
        test_support_module, "get_settings", lambda: _settings(app_env="development")
    )
    get_test_outbox().send("a@example.com", "Hi", "secret link")

    response = TestClient(app, raise_server_exceptions=False).get("/api/v1/_test/emails")

    assert response.status_code == 404
    assert "secret link" not in response.text


def test_the_inbox_is_not_in_the_public_api_schema(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _client(monkeypatch, _settings(app_env="test", test_database_url=TEST_DB))

    assert not any("_test" in path for path in client.get("/openapi.json").json()["paths"])


def test_test_environment_never_uses_a_real_sender() -> None:
    for backend in ("console", "smtp", "fake"):
        settings = _settings(
            app_env="test",
            test_database_url=TEST_DB,
            email_backend=backend,
            smtp_host="smtp.example.com",
        )

        assert get_email_sender(settings) is get_test_outbox()


def test_outbox_is_a_normal_fake_sender() -> None:
    get_test_outbox().send("a@example.com", "Hi", "text")

    assert get_test_outbox().sent == [EmailMessage("a@example.com", "Hi", "text", None)]

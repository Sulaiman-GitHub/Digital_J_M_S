import logging
import smtplib
import ssl
from email import message_from_bytes
from email.message import EmailMessage as MimeMessage
from unittest.mock import MagicMock, call

import pytest

from app.core.config import Settings
from app.integrations.email import (
    ConsoleEmailSender,
    EmailMessage,
    FakeEmailSender,
    SmtpEmailSender,
    get_email_sender,
    password_reset_email,
    send_email_safely,
    verification_email,
)
from app.integrations.email import smtp as smtp_module

LINK = "http://localhost:5173/verify-email?token=abc123&next=%2F"


# ---------- templates ----------


@pytest.mark.parametrize(
    ("build", "subject"),
    [
        (verification_email, "Confirm your email address"),
        (password_reset_email, "Reset your password"),
    ],
)
def test_templates_contain_the_link_in_text_and_escaped_html(build, subject: str) -> None:  # type: ignore[no-untyped-def]
    content = build(LINK)

    assert content.subject == subject
    assert len(content.subject) <= 60
    assert LINK in content.text_body
    assert "verify-email?token=abc123&amp;next=%2F" in content.html_body
    assert "&next" not in content.html_body.replace("&amp;next", "")
    assert "ignore this email" in content.text_body


def test_templates_escape_html_in_the_link() -> None:
    content = verification_email('http://x.ug/"><script>alert(1)</script>')

    assert "<script>" not in content.html_body
    assert "&lt;script&gt;" in content.html_body


def test_templates_state_how_long_the_link_works() -> None:
    assert "24 hours" in verification_email(LINK).text_body
    assert "60 minutes" in password_reset_email(LINK).text_body
    assert "can be used once" in password_reset_email(LINK).text_body


# ---------- fake and console senders ----------


def test_fake_sender_records_messages_in_order() -> None:
    sender = FakeEmailSender()

    sender.send("a@example.com", "First", "one")
    sender.send("b@example.com", "Second", "two", "<p>two</p>")

    assert [m.subject for m in sender.sent] == ["First", "Second"]
    assert sender.sent[1] == EmailMessage("b@example.com", "Second", "two", "<p>two</p>")
    assert sender.last_to("a@example.com").text_body == "one"
    with pytest.raises(LookupError):
        sender.last_to("nobody@example.com")


def test_console_sender_logs_the_whole_message_including_the_link(
    caplog: pytest.LogCaptureFixture,
) -> None:
    content = verification_email(LINK)

    with caplog.at_level(logging.INFO, logger="app.email.console"):
        ConsoleEmailSender("no-reply@example.com").send(
            "nakato@example.com", content.subject, content.text_body, content.html_body
        )

    logged = caplog.text
    assert "To: nakato@example.com" in logged
    assert "Subject: Confirm your email address" in logged
    assert LINK in logged


@pytest.mark.parametrize("sender", [FakeEmailSender(), ConsoleEmailSender("no-reply@example.com")])
@pytest.mark.parametrize(
    ("to", "subject"),
    [
        ("a@example.com\nBcc: attacker@example.com", "Hello"),
        ("a@example.com", "Hello\r\nBcc: attacker@example.com"),
    ],
)
def test_line_breaks_in_headers_are_rejected(sender, to: str, subject: str) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(ValueError):
        sender.send(to, subject, "body")


# ---------- SMTP sender (smtplib mocked, no network) ----------


@pytest.fixture
def smtp_mock(monkeypatch: pytest.MonkeyPatch) -> tuple[MagicMock, MagicMock]:
    smtp_class = MagicMock(name="SMTP")
    connection = smtp_class.return_value.__enter__.return_value
    monkeypatch.setattr(smtp_module.smtplib, "SMTP", smtp_class)
    return smtp_class, connection


def _sender(**overrides: object) -> SmtpEmailSender:
    options: dict[str, object] = {
        "host": "smtp.example.com",
        "port": 587,
        "sender": "no-reply@example.com",
        "username": "mailer",
        "password": "not-a-real-password",
    }
    options.update(overrides)
    return SmtpEmailSender(**options)  # type: ignore[arg-type]


def test_smtp_connects_starts_tls_then_logs_in_then_sends(
    smtp_mock: tuple[MagicMock, MagicMock],
) -> None:
    smtp_class, connection = smtp_mock
    content = password_reset_email(LINK)

    _sender().send("nakato@example.com", content.subject, content.text_body, content.html_body)

    smtp_class.assert_called_once_with("smtp.example.com", 587, timeout=10)
    names = [c[0] for c in connection.method_calls]
    assert names == ["ehlo", "starttls", "ehlo", "login", "send_message"]
    connection.login.assert_called_once_with("mailer", "not-a-real-password")

    tls_context = connection.starttls.call_args.kwargs["context"]
    assert isinstance(tls_context, ssl.SSLContext)
    assert tls_context.verify_mode == ssl.CERT_REQUIRED
    assert tls_context.check_hostname is True


def test_smtp_message_has_headers_text_and_html(smtp_mock: tuple[MagicMock, MagicMock]) -> None:
    _, connection = smtp_mock
    content = verification_email(LINK)

    _sender().send("nakato@example.com", content.subject, content.text_body, content.html_body)

    message: MimeMessage = connection.send_message.call_args.args[0]
    parsed = message_from_bytes(message.as_bytes())
    assert parsed["From"] == "no-reply@example.com"
    assert parsed["To"] == "nakato@example.com"
    assert parsed["Subject"] == "Confirm your email address"
    assert parsed["Message-ID"] and parsed["Date"]
    parts = {part.get_content_type(): part for part in parsed.walk()}
    assert LINK in parts["text/plain"].get_payload(decode=True).decode()
    assert "Confirm email" in parts["text/html"].get_payload(decode=True).decode()


def test_smtp_skips_login_without_a_username(smtp_mock: tuple[MagicMock, MagicMock]) -> None:
    _, connection = smtp_mock

    _sender(username="", password="").send("a@example.com", "Hi", "text")

    connection.login.assert_not_called()
    assert call.starttls(context=connection.starttls.call_args.kwargs["context"]) in (
        connection.method_calls
    )


def test_smtp_errors_are_raised_to_the_caller(smtp_mock: tuple[MagicMock, MagicMock]) -> None:
    smtp_class, _ = smtp_mock
    smtp_class.side_effect = smtplib.SMTPConnectError(421, b"busy")

    with pytest.raises(smtplib.SMTPConnectError):
        _sender().send("a@example.com", "Hi", "text")


# ---------- send_email_safely ----------


def test_send_email_safely_returns_true_on_success() -> None:
    sender = FakeEmailSender()
    message = EmailMessage("a@example.com", "Hi", "text")

    assert send_email_safely(sender, message) is True
    assert sender.sent == [message]


def test_send_email_safely_logs_failures_without_the_link_or_body(
    caplog: pytest.LogCaptureFixture,
) -> None:
    secret_link = "http://localhost:5173/reset-password?token=SECRET-TOKEN"

    class BrokenSender:
        def send(self, to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
            raise smtplib.SMTPServerDisconnected(f"lost connection while sending {secret_link}")

    content = password_reset_email(secret_link)
    message = EmailMessage("a@example.com", content.subject, content.text_body, content.html_body)

    with caplog.at_level(logging.ERROR, logger="app.email"):
        assert send_email_safely(BrokenSender(), message) is False

    assert "Email delivery failed" in caplog.text
    assert "SMTPServerDisconnected" in caplog.text
    assert "SECRET-TOKEN" not in caplog.text
    assert "a@example.com" not in caplog.text


# ---------- backend selection ----------


@pytest.mark.parametrize(
    ("backend", "expected"),
    [("console", ConsoleEmailSender), ("smtp", SmtpEmailSender), ("fake", FakeEmailSender)],
)
def test_backend_is_chosen_by_setting(backend: str, expected: type) -> None:
    settings = Settings(
        _env_file=None, app_env="development", email_backend=backend, smtp_host="smtp.example.com"
    )  # type: ignore[call-arg]

    assert isinstance(get_email_sender(settings), expected)


def test_smtp_sender_gets_its_settings() -> None:
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None,
        app_env="development",
        email_backend="smtp",
        smtp_host="smtp.example.com",
        smtp_port=2525,
        smtp_user="mailer",
        smtp_password="not-a-real-password",
        email_from="jobs@example.com",
    )

    sender = get_email_sender(settings)

    assert isinstance(sender, SmtpEmailSender)
    assert (sender.host, sender.port, sender.sender) == (
        "smtp.example.com",
        2525,
        "jobs@example.com",
    )
    assert (sender.username, sender.password) == ("mailer", "not-a-real-password")

"""Email delivery behind the EmailSender interface."""

from app.integrations.email.base import EmailMessage, EmailSender
from app.integrations.email.console import ConsoleEmailSender
from app.integrations.email.delivery import send_email_safely
from app.integrations.email.factory import get_email_sender, get_test_outbox
from app.integrations.email.fake import FakeEmailSender
from app.integrations.email.smtp import SmtpEmailSender
from app.integrations.email.templates import (
    EmailContent,
    password_reset_email,
    verification_email,
)

__all__ = [
    "ConsoleEmailSender",
    "EmailContent",
    "EmailMessage",
    "EmailSender",
    "FakeEmailSender",
    "SmtpEmailSender",
    "get_email_sender",
    "get_test_outbox",
    "password_reset_email",
    "send_email_safely",
    "verification_email",
]

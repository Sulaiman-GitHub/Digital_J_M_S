from app.core.config import Settings, get_settings
from app.integrations.email.base import EmailSender
from app.integrations.email.console import ConsoleEmailSender
from app.integrations.email.fake import FakeEmailSender
from app.integrations.email.smtp import SmtpEmailSender

# One shared in-memory sender for APP_ENV=test, so the test-only inbox endpoint can read what
# the app "sent" (end-to-end tests). Every other environment never uses it.
_test_outbox = FakeEmailSender()


def get_test_outbox() -> FakeEmailSender:
    return _test_outbox


def get_email_sender(settings: Settings | None = None) -> EmailSender:
    """The sender chosen by EMAIL_BACKEND (console | smtp | fake).

    In APP_ENV=test the shared fake outbox is always used, whatever EMAIL_BACKEND says, so a
    test run can never deliver real mail.
    """
    settings = settings or get_settings()
    if settings.app_env == "test":
        return _test_outbox
    match settings.email_backend:
        case "smtp":
            return SmtpEmailSender(
                host=settings.smtp_host,
                port=settings.smtp_port,
                sender=settings.email_from,
                username=settings.smtp_user,
                password=settings.smtp_password.get_secret_value(),
            )
        case "fake":
            return FakeEmailSender(sender=settings.email_from)
        case _:
            return ConsoleEmailSender(sender=settings.email_from)

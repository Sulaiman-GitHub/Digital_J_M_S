from app.core.logging import get_logger
from app.integrations.email.mime import build_mime_message

logger = get_logger("email.console")


class ConsoleEmailSender:
    """Development only: logs the whole message, including links, instead of sending it.

    Settings refuse this backend in production, because the links act like passwords.
    """

    def __init__(self, sender: str) -> None:
        self.sender = sender

    def send(self, to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
        # Build the real message so header problems fail here exactly as they would in SMTP.
        build_mime_message(
            sender=self.sender, to=to, subject=subject, text_body=text_body, html_body=html_body
        )
        logger.info(
            "Email (console backend, not sent)\nFrom: %s\nTo: %s\nSubject: %s\n\n%s",
            self.sender,
            to,
            subject,
            text_body,
        )

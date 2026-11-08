from app.integrations.email.base import EmailMessage
from app.integrations.email.mime import build_mime_message


class FakeEmailSender:
    """For tests: records messages instead of sending them."""

    def __init__(self, sender: str = "no-reply@example.com") -> None:
        self.sender = sender
        self.sent: list[EmailMessage] = []

    def send(self, to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
        # Same header validation as the real senders.
        build_mime_message(
            sender=self.sender, to=to, subject=subject, text_body=text_body, html_body=html_body
        )
        self.sent.append(
            EmailMessage(to=to, subject=subject, text_body=text_body, html_body=html_body)
        )

    def last_to(self, to: str) -> EmailMessage:
        """The most recent message sent to an address (raises if there is none)."""
        for message in reversed(self.sent):
            if message.to == to:
                return message
        raise LookupError(f"No email was sent to {to}")

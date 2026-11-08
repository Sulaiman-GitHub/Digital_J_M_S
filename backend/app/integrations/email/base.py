from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text_body: str
    html_body: str | None = None


class EmailSender(Protocol):
    """Anything that can deliver an email."""

    def send(self, to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
        """Deliver the message or raise. Callers use send_email_safely() to log failures."""
        ...

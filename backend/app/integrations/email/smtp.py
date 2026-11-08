import smtplib
import ssl

from app.integrations.email.mime import build_mime_message

SMTP_TIMEOUT_SECONDS = 10


class SmtpEmailSender:
    """Sends through an SMTP server, upgrading the connection with STARTTLS (certificate checked).

    One connection per message: simple and enough for MVP volumes.
    """

    def __init__(
        self,
        *,
        host: str,
        port: int,
        sender: str,
        username: str = "",
        password: str = "",
        timeout: float = SMTP_TIMEOUT_SECONDS,
    ) -> None:
        self.host = host
        self.port = port
        self.sender = sender
        self.username = username
        self.password = password
        self.timeout = timeout

    def send(self, to: str, subject: str, text_body: str, html_body: str | None = None) -> None:
        message = build_mime_message(
            sender=self.sender, to=to, subject=subject, text_body=text_body, html_body=html_body
        )
        with smtplib.SMTP(self.host, self.port, timeout=self.timeout) as smtp:
            smtp.ehlo()
            # Encrypt before any credentials or content are sent.
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            if self.username:
                smtp.login(self.username, self.password)
            smtp.send_message(message)

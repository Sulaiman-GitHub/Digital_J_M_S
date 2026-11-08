from app.core.logging import get_logger
from app.integrations.email.base import EmailMessage, EmailSender

logger = get_logger("email")


def send_email_safely(sender: EmailSender, message: EmailMessage) -> bool:
    """Send and never raise. For FastAPI BackgroundTasks, after the database commit.

    A failure is logged with the subject and the error type only: never the body, which holds
    verification or reset links. Returns True if the message was handed to the sender.
    """
    try:
        sender.send(message.to, message.subject, message.text_body, message.html_body)
    except Exception as exc:  # noqa: BLE001 - email must never break the request
        logger.error(
            "Email delivery failed (subject=%r, error=%s)", message.subject, type(exc).__name__
        )
        return False
    return True

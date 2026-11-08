"""Build a standards-compliant MIME message. Shared by the SMTP and console senders."""

from email.message import EmailMessage as MimeMessage
from email.utils import formatdate, make_msgid


def build_mime_message(
    *, sender: str, to: str, subject: str, text_body: str, html_body: str | None
) -> MimeMessage:
    """Plain text first, HTML as an alternative.

    Python's email library raises ValueError when a header value contains a line break, which
    blocks header injection (e.g. a recipient like "a@b.ug\\nBcc: c@d.ug").
    """
    message = MimeMessage()
    message["From"] = sender
    message["To"] = to
    message["Subject"] = subject
    message["Date"] = formatdate(localtime=False, usegmt=True)
    message["Message-ID"] = make_msgid()
    message.set_content(text_body)
    if html_body is not None:
        message.add_alternative(html_body, subtype="html")
    return message

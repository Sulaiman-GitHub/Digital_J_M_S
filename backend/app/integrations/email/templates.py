"""Email templates as plain functions. Plain English, plain text first, simple HTML second."""

from dataclasses import dataclass
from html import escape

APP_NAME = "Digital Job Matching System"


@dataclass(frozen=True)
class EmailContent:
    subject: str
    text_body: str
    html_body: str


def _html(heading: str, intro: str, link: str, button: str, footer: str) -> str:
    safe_link = escape(link, quote=True)
    return (
        '<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;'
        'color:#111827;line-height:1.5;max-width:560px;margin:0 auto;padding:16px">'
        f'<h1 style="font-size:20px">{escape(heading)}</h1>'
        f"<p>{escape(intro)}</p>"
        f'<p><a href="{safe_link}" style="display:inline-block;background:#0f766e;color:#ffffff;'
        f'padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">'
        f"{escape(button)}</a></p>"
        f'<p style="color:#4b5563;font-size:14px">If the button does not work, copy this link '
        f'into your browser:<br><a href="{safe_link}">{escape(link)}</a></p>'
        f'<p style="color:#4b5563;font-size:14px">{escape(footer)}</p>'
        f'<p style="color:#4b5563;font-size:14px">{escape(APP_NAME)}</p>'
        "</body></html>"
    )


def verification_email(link: str, expires_hours: int = 24) -> EmailContent:
    intro = f"Please confirm your email address to finish setting up your {APP_NAME} account."
    footer = (
        f"This link works for {expires_hours} hours. "
        "If you did not create an account, you can ignore this email."
    )
    return EmailContent(
        subject="Confirm your email address",
        text_body=(
            f"Hello,\n\n{intro}\n\nOpen this link to confirm:\n{link}\n\n{footer}\n\n{APP_NAME}\n"
        ),
        html_body=_html("Confirm your email address", intro, link, "Confirm email", footer),
    )


def password_reset_email(link: str, expires_minutes: int = 60) -> EmailContent:
    intro = f"Someone asked to reset the password for your {APP_NAME} account."
    footer = (
        f"This link works for {expires_minutes} minutes and can be used once. "
        "If you did not ask for this, ignore this email: your password stays the same."
    )
    return EmailContent(
        subject="Reset your password",
        text_body=(
            f"Hello,\n\n{intro}\n\nOpen this link to choose a new password:\n{link}\n\n"
            f"{footer}\n\n{APP_NAME}\n"
        ),
        html_body=_html("Reset your password", intro, link, "Choose a new password", footer),
    )

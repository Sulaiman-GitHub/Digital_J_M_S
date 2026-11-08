"""Helpers for auth API tests. Sample data is fictional."""

import re
from datetime import UTC, datetime

from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.cookies import CSRF_COOKIE, CSRF_HEADER
from app.core.security import normalise_email
from app.integrations.email import FakeEmailSender
from app.models import User, UserStatus

PASSWORD = "Kampala-Sunrise-42"
AUTH = "/api/v1/auth"


def register(
    client: TestClient,
    email: str = "nakato@example.com",
    password: str = PASSWORD,
    role: str = "job_seeker",
    accept_terms: bool = True,
) -> Response:
    return client.post(
        f"{AUTH}/register",
        json={"email": email, "password": password, "role": role, "accept_terms": accept_terms},
    )


def login(
    client: TestClient, email: str = "nakato@example.com", password: str = PASSWORD
) -> Response:
    return client.post(f"{AUTH}/login", json={"email": email, "password": password})


def register_and_login(
    client: TestClient, email: str = "nakato@example.com", role: str = "job_seeker"
) -> Response:
    assert register(client, email, role=role).status_code == 201
    response = login(client, email)
    assert response.status_code == 200, response.text
    return response


def csrf_headers(client: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}


def token_from_email(fake_email: FakeEmailSender, to: str) -> str:
    match = re.search(r"token=([A-Za-z0-9_\-]+)", fake_email.last_to(to).text_body)
    assert match, "no token link in the email"
    return match.group(1)


def get_user(db: Session, email: str = "nakato@example.com") -> User:
    return db.scalars(select(User).where(User.email_normalized == normalise_email(email))).one()


def set_status(db: Session, email: str, status: UserStatus) -> None:
    user = get_user(db, email)
    user.status = status
    if status is UserStatus.DELETED:
        user.deleted_at = datetime.now(UTC)
    db.flush()


def error_code(response: Response) -> str:
    return response.json()["error"]["code"]

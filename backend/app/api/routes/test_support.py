"""Test-only endpoints for end-to-end tests. Registered only when APP_ENV=test (see main.py).

Outside the test environment these routes do not exist (404), and each one also checks the
environment itself, so a wiring mistake cannot expose them.
"""

import uuid

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, text, update

from app.api.deps import DbSession
from app.core.config import get_settings
from app.core.errors import AppError
from app.integrations.email import get_test_outbox
from app.models import Vacancy
from app.schemas.common import DataResponse


def require_test_environment() -> None:
    if get_settings().app_env != "test":
        raise AppError("not_found", "Not Found", status=404)


router = APIRouter(
    prefix="/_test",
    tags=["test-support"],
    include_in_schema=False,  # not part of the public API contract
    dependencies=[Depends(require_test_environment)],
)


class InboxMessage(BaseModel):
    to: str
    subject: str
    text_body: str
    html_body: str | None


@router.get("/emails")
def list_emails(to: str | None = None) -> DataResponse[list[InboxMessage]]:
    """Emails the app has "sent" in this test run, oldest first, optionally for one address."""
    wanted = to.strip().lower() if to else None
    messages = [
        InboxMessage(to=m.to, subject=m.subject, text_body=m.text_body, html_body=m.html_body)
        for m in get_test_outbox().sent
        if wanted is None or m.to.strip().lower() == wanted
    ]
    return DataResponse(data=messages)


@router.delete("/emails", status_code=status.HTTP_204_NO_CONTENT)
def clear_emails() -> Response:
    get_test_outbox().sent.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/vacancies/{vacancy_id}/expire", status_code=status.HTTP_204_NO_CONTENT)
def expire_vacancy(vacancy_id: uuid.UUID, db: DbSession) -> Response:
    """Give a vacancy an expiry in the past, as if its closing date had gone by. The real API
    never allows this (publishing needs a future date), so end-to-end tests do it here."""
    changed = db.execute(
        update(Vacancy)
        .where(Vacancy.id == vacancy_id)
        .values(expires_at=func.now() - text("interval '1 minute'"))
    ).rowcount
    if changed == 0:
        raise AppError("not_found", "Not Found", status=404)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

"""Saved jobs: a job seeker bookmarks vacancies and lists them. Owner only."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import DbSession, require_csrf, require_role
from app.models import User, UserRole
from app.schemas.common import DataResponse, PagedResponse, PageMeta, error_responses
from app.schemas.public_vacancy import VacancyCard
from app.schemas.saved_vacancy import SavedIds
from app.services import saved_vacancies as saved_service

router = APIRouter(prefix="/saved-vacancies", tags=["saved-vacancies"])

SeekerUser = Annotated[User, Depends(require_role(UserRole.JOB_SEEKER))]
MAX_PAGE_SIZE = 50


@router.get("", responses=error_responses(401, 403, 422))
def list_saved(
    user: SeekerUser,
    db: DbSession,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
) -> PagedResponse[VacancyCard]:
    """The caller's saved vacancies that are still open, most recently saved first."""
    cards, total = saved_service.list_saved(db, user, page=page, page_size=page_size)
    return PagedResponse(data=cards, meta=PageMeta(page=page, page_size=page_size, total=total))


@router.get("/ids", responses=error_responses(401, 403))
def saved_ids(user: SeekerUser, db: DbSession) -> DataResponse[SavedIds]:
    """Just the ids of the saved open vacancies, to show a filled bookmark on cards."""
    return DataResponse(data=SavedIds(vacancy_ids=saved_service.saved_ids(db, user)))


@router.put(
    "/{vacancy_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409, 422),
)
def save_vacancy(vacancy_id: uuid.UUID, user: SeekerUser, db: DbSession) -> Response:
    """Save a vacancy. Safe to repeat. Only open vacancies can be saved."""
    saved_service.save(db, user, vacancy_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/{vacancy_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 422),
)
def unsave_vacancy(vacancy_id: uuid.UUID, user: SeekerUser, db: DbSession) -> Response:
    """Remove a saved vacancy. Safe to repeat."""
    saved_service.unsave(db, user, vacancy_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

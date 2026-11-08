"""Public vacancy search and detail. No login needed; only live vacancies appear."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DbSession
from app.models import EmploymentType, WorkArrangement
from app.schemas.common import DataResponse, PagedResponse, PageMeta, error_responses
from app.schemas.public_vacancy import VacancyCard, VacancyDetail
from app.services import public_vacancies as service
from app.services.public_vacancies import Q_MAX_LENGTH, SearchFilters, Sort

router = APIRouter(prefix="/vacancies", tags=["vacancies"])

MAX_PAGE_SIZE = 50


@router.get("", responses=error_responses(422))
def search_vacancies(
    db: DbSession,
    q: Annotated[
        str | None, Query(max_length=Q_MAX_LENGTH, description="Words to search for")
    ] = None,
    district_id: Annotated[uuid.UUID | None, Query()] = None,
    qualification_level_id: Annotated[
        uuid.UUID | None,
        Query(description="Show vacancies that ask for this level or lower, or nothing"),
    ] = None,
    employment_type: Annotated[EmploymentType | None, Query()] = None,
    work_arrangement: Annotated[WorkArrangement | None, Query()] = None,
    sort: Annotated[
        Sort | None, Query(description="relevance (default with q) or newest (default otherwise)")
    ] = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
) -> PagedResponse[VacancyCard]:
    """Live vacancies, as cards. Text search uses full-text matching ranked by relevance."""
    cards, total = service.search(
        db,
        SearchFilters(
            q=q,
            district_id=district_id,
            qualification_level_id=qualification_level_id,
            employment_type=employment_type,
            work_arrangement=work_arrangement,
            sort=sort,
        ),
        page=page,
        page_size=page_size,
    )
    return PagedResponse(data=cards, meta=PageMeta(page=page, page_size=page_size, total=total))


@router.get("/{vacancy_id}", responses=error_responses(404, 422))
def get_vacancy(vacancy_id: uuid.UUID, db: DbSession) -> DataResponse[VacancyDetail]:
    """One live vacancy. A draft, closed or expired one is 404."""
    return DataResponse(data=service.get_detail(db, vacancy_id))

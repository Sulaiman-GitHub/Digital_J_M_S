"""The employer's own vacancies. No vacancy of another employer is ever reachable."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.api.deps import (
    DbSession,
    PublishingEmployer,
    client_ip,
    require_csrf,
    require_role,
)
from app.models import User, UserRole, VacancyStatus
from app.schemas.common import DataResponse, PagedResponse, PageMeta, error_responses
from app.schemas.vacancy import VacancyIn, VacancyOut
from app.services import employers as employer_service
from app.services import vacancies as vacancy_service

router = APIRouter(prefix="/employer/vacancies", tags=["employer-vacancies"])

EmployerUser = Annotated[User, Depends(require_role(UserRole.EMPLOYER))]
MAX_PAGE_SIZE = 50


def _out(view: vacancy_service.VacancyView) -> VacancyOut:
    return VacancyOut.build(
        view.vacancy,
        view.requirements,
        view.is_live,
        view.application_count,
        view.new_application_count,
    )


@router.get("", responses=error_responses(401, 403, 404, 422))
def list_my_vacancies(
    user: EmployerUser,
    db: DbSession,
    vacancy_status: Annotated[VacancyStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
) -> PagedResponse[VacancyOut]:
    """Own vacancies of any status, most recently changed first."""
    employer = employer_service.get_my_employer(db, user)
    views, total = vacancy_service.list_for_employer(
        db, employer, status=vacancy_status, page=page, page_size=page_size
    )
    return PagedResponse(
        data=[_out(item) for item in views],
        meta=PageMeta(page=page, page_size=page_size, total=total),
    )


@router.get("/{vacancy_id}", responses=error_responses(401, 403, 404, 422))
def get_my_vacancy(
    vacancy_id: uuid.UUID, user: EmployerUser, db: DbSession
) -> DataResponse[VacancyOut]:
    vacancy = vacancy_service.get_for_actor(db, vacancy_id, user)
    return DataResponse(data=_out(vacancy_service.view(db, vacancy)))


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 422),
)
def create_vacancy(body: VacancyIn, user: EmployerUser, db: DbSession) -> DataResponse[VacancyOut]:
    """Create a draft. Needs a company profile, but not an approved one (only publishing does)."""
    employer = employer_service.get_my_employer(db, user)
    vacancy = vacancy_service.create_draft(db, employer, body)
    return DataResponse(data=_out(vacancy_service.view(db, vacancy)))


@router.put(
    "/{vacancy_id}",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409, 422),
)
def update_vacancy(
    vacancy_id: uuid.UUID, body: VacancyIn, user: EmployerUser, db: DbSession
) -> DataResponse[VacancyOut]:
    """Replace the editable fields. A published vacancy keeps its title, type, place and how to
    apply; closed ones cannot be edited."""
    vacancy = vacancy_service.get_for_actor(db, vacancy_id, user, lock=True)
    vacancy_service.update(db, vacancy, body)
    return DataResponse(data=_out(vacancy_service.view(db, vacancy)))


@router.post(
    "/{vacancy_id}/publish",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409, 422),
)
def publish_vacancy(
    vacancy_id: uuid.UUID,
    request: Request,
    employer: PublishingEmployer,
    user: EmployerUser,
    db: DbSession,
) -> DataResponse[VacancyOut]:
    """Draft to published. Only an approved employer (403 employer_not_verified otherwise)."""
    vacancy = vacancy_service.get_for_actor(db, vacancy_id, user, lock=True)
    vacancy_service.publish(db, vacancy, user, ip=client_ip(request))
    return DataResponse(data=_out(vacancy_service.view(db, vacancy)))


@router.post(
    "/{vacancy_id}/close",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409),
)
def close_vacancy(
    vacancy_id: uuid.UUID, request: Request, user: EmployerUser, db: DbSession
) -> DataResponse[VacancyOut]:
    """Close a vacancy for good. It cannot be reopened."""
    vacancy = vacancy_service.get_for_actor(db, vacancy_id, user, lock=True)
    vacancy_service.close(db, vacancy, user, ip=client_ip(request))
    return DataResponse(data=_out(vacancy_service.view(db, vacancy)))

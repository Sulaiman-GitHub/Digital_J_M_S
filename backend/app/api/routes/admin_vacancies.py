"""Admin creates vacancies for partner employers. Admin only."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status

from app.api.deps import DbSession, client_ip, require_csrf, require_role
from app.models import User, UserRole
from app.schemas.common import DataResponse, error_responses
from app.schemas.vacancy import AdminVacancyIn, VacancyIn, VacancyOut
from app.services import vacancies as vacancy_service

router = APIRouter(prefix="/admin/vacancies", tags=["admin"])

AdminUser = Annotated[User, Depends(require_role(UserRole.ADMIN))]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409, 422),
)
def create_for_partner(
    body: AdminVacancyIn, request: Request, admin: AdminUser, db: DbSession
) -> DataResponse[VacancyOut]:
    """Create a vacancy on behalf of an approved partner employer (a draft; `publish: true`
    publishes it straight away). Marked created_by_admin."""
    employer = vacancy_service.partner_employer(db, body.employer_id)
    data = VacancyIn.model_validate(body.model_dump(exclude={"employer_id", "publish"}))
    vacancy = vacancy_service.create_draft(db, employer, data, created_by_admin=True)
    if body.publish:
        vacancy_service.publish(db, vacancy, admin, ip=client_ip(request))
    shown = vacancy_service.view(db, vacancy)
    return DataResponse(data=VacancyOut.build(shown.vacancy, shown.requirements, shown.is_live))

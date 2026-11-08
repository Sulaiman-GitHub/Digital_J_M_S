"""Reporting a vacancy: any logged-in user, rate limited."""

import uuid

from fastapi import APIRouter, Depends, Request, status

from app.api.deps import CurrentUser, DbSession, client_ip, require_csrf
from app.core.rate_limit import limiter, report_rate_limit
from app.schemas.common import DataResponse, error_responses
from app.schemas.report import ReportCreated, ReportIn
from app.services import reports as report_service

router = APIRouter(prefix="/vacancies", tags=["reports"])


@router.post(
    "/{vacancy_id}/reports",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 404, 409, 422, 429),
)
# slowapi counts per URL by default, and this URL holds a vacancy id: a fixed scope makes the limit
# apply to all of a visitor's reports together, which is what the limit is for.
@limiter.shared_limit(report_rate_limit, scope="vacancy_reports")
def report_vacancy(
    vacancy_id: uuid.UUID,
    body: ReportIn,
    request: Request,
    user: CurrentUser,
    db: DbSession,
) -> DataResponse[ReportCreated]:
    """Report a live vacancy. One open report per person per vacancy."""
    report = report_service.create_report(db, user, vacancy_id, body, ip=client_ip(request))
    return DataResponse(
        data=ReportCreated(id=report.id, status=report.status, created_at=report.created_at)
    )

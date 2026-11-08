"""Admin handling of vacancy reports. Admin role only."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import DbSession, client_ip, require_csrf, require_role
from app.models import ReportStatus, User, UserRole
from app.schemas.common import DataResponse, PagedResponse, PageMeta, error_responses
from app.schemas.report import AdminReportItem, ReportedVacancy, ResolveIn
from app.services import reports as report_service
from app.services.vacancies import is_live

router = APIRouter(prefix="/admin/reports", tags=["admin"])

AdminUser = Annotated[User, Depends(require_role(UserRole.ADMIN))]
MAX_PAGE_SIZE = 50
PREVIEW_CHARS = 1500


def _item(row: report_service.ReportRow) -> AdminReportItem:
    vacancy = row.vacancy
    description = vacancy.description
    if description and len(description) > PREVIEW_CHARS:
        description = description[:PREVIEW_CHARS].rstrip() + "…"
    return AdminReportItem(
        id=row.report.id,
        reason=row.report.reason,
        details=row.report.details,
        status=row.report.status,
        created_at=row.report.created_at,
        handled_at=row.report.handled_at,
        reporter_email=row.reporter_email,
        vacancy=ReportedVacancy(
            id=vacancy.id,
            title=vacancy.title,
            description=description,
            status=vacancy.status,
            is_live=is_live(vacancy),
            company_name=row.company_name,
            employer_id=vacancy.employer_id,
            employer_status=row.employer_status,
        ),
        open_reports_for_vacancy=row.open_for_vacancy,
    )


@router.get("", responses=error_responses(401, 403, 422))
def list_reports(
    admin: AdminUser,
    db: DbSession,
    status: Annotated[ReportStatus | None, Query()] = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
) -> PagedResponse[AdminReportItem]:
    """Reports, newest first. Filter with ?status=open."""
    rows, total = report_service.list_reports(db, status=status, page=page, page_size=page_size)
    return PagedResponse(
        data=[_item(row) for row in rows],
        meta=PageMeta(page=page, page_size=page_size, total=total),
    )


@router.post(
    "/{report_id}/resolve",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409, 422),
)
def resolve_report(
    report_id: uuid.UUID,
    body: ResolveIn,
    request: Request,
    admin: AdminUser,
    db: DbSession,
) -> DataResponse[AdminReportItem]:
    """Dismiss the report, or act on it: the vacancy is closed (and so leaves public search) and
    the employer can be suspended too. Acting also settles every other open report about it."""
    row = report_service.resolve_report(
        db,
        report_id,
        admin,
        action=body.action,
        note=body.note,
        suspend_employer=body.suspend_employer,
        ip=client_ip(request),
    )
    return DataResponse(data=_item(row))

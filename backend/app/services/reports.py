"""Reporting vacancies and resolving the reports.

Anyone logged in can report a live vacancy once. An admin then dismisses the report, or acts on
it: the vacancy is closed (so it leaves public search at once) and, if the admin chooses, the
employer is suspended through the same state machine as every other verification change.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    Employer,
    ReportReason,
    ReportStatus,
    User,
    Vacancy,
    VacancyReport,
    VacancyStatus,
    VerificationStatus,
)
from app.schemas.report import ReportIn
from app.services import employers as employer_service
from app.services import vacancies as vacancy_service
from app.services.audit import record_event
from app.services.vacancies import live_clause


@dataclass(frozen=True)
class ReportRow:
    report: VacancyReport
    reporter_email: str | None
    vacancy: Vacancy
    company_name: str
    employer_status: VerificationStatus
    open_for_vacancy: int


def create_report(
    db: Session, user: User, vacancy_id: uuid.UUID, data: ReportIn, *, ip: str | None = None
) -> VacancyReport:
    """Report a live vacancy. Only live vacancies can be seen, so only those can be reported."""
    vacancy = db.scalar(select(Vacancy).where(Vacancy.id == vacancy_id, live_clause()))
    if vacancy is None:
        raise AppError("vacancy_not_found", "This vacancy does not exist.", status=404)
    owner_id = db.scalar(select(Employer.owner_user_id).where(Employer.id == vacancy.employer_id))
    if owner_id == user.id:
        raise AppError(
            "cannot_report_own_vacancy", "You cannot report your own vacancy.", status=409
        )
    if data.reason == ReportReason.OTHER and not data.details:
        raise AppError(
            "validation_error",
            "Some fields are invalid.",
            status=422,
            details={"fields": {"details": "Tell us what is wrong."}},
        )
    already = db.scalar(
        select(VacancyReport.id).where(
            VacancyReport.vacancy_id == vacancy.id,
            VacancyReport.reporter_user_id == user.id,
            VacancyReport.status == ReportStatus.OPEN,
        )
    )
    if already is not None:
        raise _already_reported()
    report = VacancyReport(
        vacancy_id=vacancy.id,
        reporter_user_id=user.id,
        reason=data.reason,
        details=data.details,
    )
    try:
        with db.begin_nested():  # two clicks at once: the unique index decides
            db.add(report)
    except IntegrityError:
        raise _already_reported() from None
    record_event(
        db,
        "vacancy_reported",
        actor_user_id=user.id,
        entity_type="vacancy",
        entity_id=vacancy.id,
        metadata={"reason": data.reason.value},
        ip=ip,
    )
    db.flush()
    return report


def _already_reported() -> AppError:
    return AppError(
        "already_reported",
        "You have already reported this vacancy. We will look at it.",
        status=409,
    )


def list_reports(
    db: Session, *, status: ReportStatus | None, page: int, page_size: int
) -> tuple[list[ReportRow], int]:
    """Reports, newest first, with the vacancy and company each one is about."""
    filters = [VacancyReport.status == status] if status is not None else []
    total = db.scalar(select(func.count()).select_from(VacancyReport).where(*filters)) or 0
    open_counts = (
        select(VacancyReport.vacancy_id, func.count().label("open_count"))
        .where(VacancyReport.status == ReportStatus.OPEN)
        .group_by(VacancyReport.vacancy_id)
        .subquery()
    )
    rows = db.execute(
        select(
            VacancyReport,
            User.email,
            Vacancy,
            Employer.company_name,
            Employer.verification_status,
            func.coalesce(open_counts.c.open_count, 0),
        )
        .join(Vacancy, Vacancy.id == VacancyReport.vacancy_id)
        .join(Employer, Employer.id == Vacancy.employer_id)
        .outerjoin(User, User.id == VacancyReport.reporter_user_id)
        .outerjoin(open_counts, open_counts.c.vacancy_id == VacancyReport.vacancy_id)
        .where(*filters)
        .order_by(VacancyReport.created_at.desc(), VacancyReport.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    return [ReportRow(*row) for row in rows], total


def _row(db: Session, report_id: uuid.UUID) -> ReportRow:
    row = db.execute(
        select(
            VacancyReport,
            User.email,
            Vacancy,
            Employer.company_name,
            Employer.verification_status,
        )
        .join(Vacancy, Vacancy.id == VacancyReport.vacancy_id)
        .join(Employer, Employer.id == Vacancy.employer_id)
        .outerjoin(User, User.id == VacancyReport.reporter_user_id)
        .where(VacancyReport.id == report_id)
    ).first()
    if row is None:
        raise AppError("report_not_found", "This report does not exist.", status=404)
    report, email, vacancy, company_name, employer_status = row
    open_for_vacancy = (
        db.scalar(
            select(func.count())
            .select_from(VacancyReport)
            .where(
                VacancyReport.vacancy_id == report.vacancy_id,
                VacancyReport.status == ReportStatus.OPEN,
            )
        )
        or 0
    )
    return ReportRow(report, email, vacancy, company_name, employer_status, open_for_vacancy)


def resolve_report(
    db: Session,
    report_id: uuid.UUID,
    admin: User,
    *,
    action: str,
    note: str | None,
    suspend_employer: bool,
    ip: str | None = None,
) -> ReportRow:
    """Dismiss a report, or act on it: close the vacancy (all open reports about it are then
    actioned) and optionally suspend the employer. Everything happens in one transaction."""
    report = db.scalar(select(VacancyReport).where(VacancyReport.id == report_id).with_for_update())
    if report is None:
        raise AppError("report_not_found", "This report does not exist.", status=404)
    if report.status != ReportStatus.OPEN:
        raise AppError(
            "report_already_resolved", "This report has already been handled.", status=409
        )
    if suspend_employer and action != "action":
        raise AppError(
            "validation_error",
            "Some fields are invalid.",
            status=422,
            details={"fields": {"suspend_employer": "Only an action can suspend the employer."}},
        )

    now = datetime.now(UTC)
    vacancy = db.get_one(Vacancy, report.vacancy_id)
    closed = suspended = False
    affected = [report]

    if action == "dismiss":
        report.status = ReportStatus.DISMISSED
    else:
        if vacancy.status != VacancyStatus.CLOSED:
            vacancy_service.close(db, vacancy, admin, ip=ip)
            closed = True
        if suspend_employer:
            employer = db.get_one(Employer, vacancy.employer_id)
            employer_service.change_status(
                db, employer, VerificationStatus.SUSPENDED, actor=admin, reason=note, ip=ip
            )
            suspended = True
        # The vacancy is gone, so every open report about it is dealt with too.
        affected = list(
            db.scalars(
                select(VacancyReport).where(
                    VacancyReport.vacancy_id == vacancy.id,
                    VacancyReport.status == ReportStatus.OPEN,
                )
            )
        )
        for item in affected:
            item.status = ReportStatus.ACTIONED
    for item in affected:
        item.handled_by_user_id = admin.id
        item.handled_at = now
    record_event(
        db,
        "report_dismissed" if action == "dismiss" else "report_actioned",
        actor_user_id=admin.id,
        entity_type="report",
        entity_id=report.id,
        metadata={
            "vacancy_id": str(vacancy.id),
            "closed_vacancy": closed,
            "suspended_employer": suspended,
            "reports_resolved": len(affected),
            "note": note,
        },
        ip=ip,
    )
    db.flush()
    return _row(db, report.id)

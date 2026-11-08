"""Applications: seekers apply and withdraw; the vacancy employer reviews.

Ownership is checked in the service: anyone who is not the applicant or the vacancy's
employer gets 404, as if the application did not exist.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import StreamingResponse

from app.api.deps import (
    CurrentUser,
    DbSession,
    FileStorageDep,
    PublishingEmployer,
    client_ip,
    require_csrf,
    require_role,
    require_verified_email,
)
from app.api.routes.cv import attachment_headers
from app.core.rate_limit import apply_rate_limit, limiter
from app.models import ApplicationStatus, User, UserRole
from app.schemas.application import (
    ApplicantItem,
    ApplicationDetail,
    ApplicationItem,
    ApplyIn,
    CvSummary,
    HistoryItem,
    StatusChangeIn,
    VacancySummary,
)
from app.schemas.common import DataResponse, PagedResponse, PageMeta, error_responses
from app.services import applications as application_service
from app.services import cvs as cv_service
from app.services.applications import Actor, ApplicationView
from app.services.vacancies import is_live

router = APIRouter(tags=["applications"])

SeekerUser = Annotated[User, Depends(require_role(UserRole.JOB_SEEKER))]


def require_verified_seeker(user: SeekerUser) -> User:
    """Only a job seeker with a confirmed email address can apply."""
    return require_verified_email(user)


VerifiedSeeker = Annotated[User, Depends(require_verified_seeker)]
EmployerUser = Annotated[User, Depends(require_role(UserRole.EMPLOYER))]
MAX_PAGE_SIZE = 50


def _vacancy_summary(vacancy, company_name: str) -> VacancySummary:
    return VacancySummary(
        id=vacancy.id,
        title=vacancy.title,
        company_name=company_name,
        status=vacancy.status,
        is_live=is_live(vacancy),
    )


def _detail(view: ApplicationView) -> ApplicationDetail:
    application = view.application
    return ApplicationDetail(
        id=application.id,
        status=application.status,
        submitted_at=application.submitted_at,
        updated_at=application.updated_at,
        cover_note=application.cover_note,
        vacancy=_vacancy_summary(view.vacancy, view.company_name),
        profile=application.profile_snapshot,
        cv=CvSummary(
            original_filename=application.cv_original_filename,
            content_type=application.cv_content_type,
            size_bytes=application.cv_size_bytes,
        ),
        applicant_email=(view.applicant_email or None) if view.actor is Actor.EMPLOYER else None,
        next_statuses=sorted(
            application_service.allowed_next(application.status, view.actor),
            key=list(ApplicationStatus).index,
        ),
        history=[
            HistoryItem(
                from_status=event.from_status,
                to_status=event.to_status,
                by="applicant"
                if event.actor_user_id == application.applicant_user_id
                else "employer",
                note=event.note,
                created_at=event.created_at,
            )
            for event in view.history
        ],
    )


@router.post(
    "/vacancies/{vacancy_id}/applications",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(400, 401, 403, 404, 409, 422, 429, 503),
)
# One counter for all of a visitor's applications (the URL holds a vacancy id).
@limiter.shared_limit(apply_rate_limit, scope="applications")
def apply(
    vacancy_id: uuid.UUID,
    body: ApplyIn,
    request: Request,
    user: VerifiedSeeker,
    db: DbSession,
    storage: FileStorageDep,
) -> DataResponse[ApplicationDetail]:
    """Apply with the current profile and CV. Both are copied, so later edits do not change it."""
    application = application_service.submit(
        db, storage, user, vacancy_id, body, ip=client_ip(request)
    )
    return DataResponse(data=_detail(application_service.get_application(db, user, application.id)))


@router.get("/applications/me", responses=error_responses(401, 403, 422))
def my_applications(
    user: SeekerUser,
    db: DbSession,
    vacancy_id: uuid.UUID | None = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
) -> PagedResponse[ApplicationItem]:
    """The caller's own applications, newest first. `vacancy_id` narrows it to one vacancy."""
    rows, total = application_service.list_mine(
        db, user, page=page, page_size=page_size, vacancy_id=vacancy_id
    )
    return PagedResponse(
        data=[
            ApplicationItem(
                id=application.id,
                status=application.status,
                submitted_at=application.submitted_at,
                updated_at=application.updated_at,
                vacancy=_vacancy_summary(vacancy, company_name),
            )
            for application, vacancy, company_name in rows
        ],
        meta=PageMeta(page=page, page_size=page_size, total=total),
    )


@router.get("/applications/{application_id}", responses=error_responses(401, 403, 404, 422))
def get_application(
    application_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> DataResponse[ApplicationDetail]:
    """The applicant's own application, or one for the caller's own vacancy. Anyone else: 404."""
    return DataResponse(data=_detail(application_service.get_application(db, user, application_id)))


@router.post(
    "/applications/{application_id}/withdraw",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409, 422),
)
def withdraw_application(
    application_id: uuid.UUID, request: Request, user: SeekerUser, db: DbSession
) -> DataResponse[ApplicationDetail]:
    view = application_service.withdraw(db, user, application_id, ip=client_ip(request))
    return DataResponse(data=_detail(view))


@router.get(
    "/employer/vacancies/{vacancy_id}/applications",
    responses=error_responses(401, 403, 404, 422),
)
def vacancy_applications(
    vacancy_id: uuid.UUID,
    employer: PublishingEmployer,
    db: DbSession,
    application_status: Annotated[ApplicationStatus | None, Query(alias="status")] = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
) -> PagedResponse[ApplicantItem]:
    """Applicants for one of the employer's own vacancies, newest first."""
    rows, total = application_service.list_for_vacancy(
        db, employer, vacancy_id, status=application_status, page=page, page_size=page_size
    )
    return PagedResponse(
        data=[
            ApplicantItem(
                id=application.id,
                status=application.status,
                submitted_at=application.submitted_at,
                updated_at=application.updated_at,
                applicant_name=application.profile_snapshot.get("full_name", ""),
                applicant_email=email,
                qualification=application.profile_snapshot.get("qualification"),
                institution=application.profile_snapshot.get("institution"),
                has_cover_note=bool(application.cover_note),
            )
            for application, email in rows
        ],
        meta=PageMeta(page=page, page_size=page_size, total=total),
    )


@router.post(
    "/employer/applications/{application_id}/status",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409, 422),
)
def change_status(
    application_id: uuid.UUID,
    body: StatusChangeIn,
    request: Request,
    user: EmployerUser,
    db: DbSession,
) -> DataResponse[ApplicationDetail]:
    view = application_service.employer_update_status(
        db, user, application_id, body.status, body.note, ip=client_ip(request)
    )
    return DataResponse(data=_detail(view))


@router.get(
    "/employer/applications/{application_id}/cv",
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "The CV the applicant sent",
            "content": {"application/octet-stream": {}},
        },
        **error_responses(401, 403, 404, 503),
    },
)
def download_application_cv(
    application_id: uuid.UUID,
    request: Request,
    user: EmployerUser,
    db: DbSession,
    storage: FileStorageDep,
) -> StreamingResponse:
    """The applicant's copy of the CV, for the vacancy's approved employer only. Each download is
    recorded in the audit log."""
    application, stream = application_service.open_snapshot_cv(
        db, storage, user, application_id, ip=client_ip(request)
    )
    return StreamingResponse(
        cv_service.iter_file(stream),
        media_type=application.cv_content_type,
        headers=attachment_headers(application.cv_original_filename, application.cv_size_bytes),
    )

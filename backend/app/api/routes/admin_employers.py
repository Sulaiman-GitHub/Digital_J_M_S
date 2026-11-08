"""Admin verification of employers. Admin role only, on every route."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.api.deps import DbSession, client_ip, require_csrf, require_role
from app.models import User, UserRole, VerificationStatus
from app.schemas.admin_employer import (
    EmployerDetail,
    EmployerListItem,
    HistoryItem,
    OwnerOut,
    ReasonIn,
)
from app.schemas.common import DataResponse, PagedResponse, PageMeta, error_responses
from app.services import admin_employers as admin_service

router = APIRouter(prefix="/admin/employers", tags=["admin"])

AdminUser = Annotated[User, Depends(require_role(UserRole.ADMIN))]
S = VerificationStatus
MAX_PAGE_SIZE = 50


def _detail_out(view: admin_service.DetailView) -> DataResponse[EmployerDetail]:
    employer = view.employer
    return DataResponse(
        data=EmployerDetail(
            id=employer.id,
            owner=OwnerOut(
                id=view.owner.id,
                email=view.owner.email,
                email_verified=view.owner.email_verified_at is not None,
            ),
            company_name=employer.company_name,
            registration_number=employer.registration_number,
            website=employer.website,
            contact_phone=employer.contact_phone,
            district_id=employer.district_id,
            district_name=view.district_name,
            description=employer.description,
            verification_status=employer.verification_status,
            submitted_at=employer.submitted_at,
            decided_at=employer.decided_at,
            created_at=employer.created_at,
            history=[
                HistoryItem(
                    id=row.event.id,
                    from_status=row.event.from_status,
                    to_status=row.event.to_status,
                    actor_email=row.actor_email,
                    reason=row.event.reason,
                    created_at=row.event.created_at,
                )
                for row in view.history
            ],
        )
    )


@router.get("", responses=error_responses(401, 403, 422))
def list_employers(
    admin: AdminUser,
    db: DbSession,
    status: Annotated[VerificationStatus | None, Query()] = None,
    page: Annotated[int, Query(ge=1, le=100_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
) -> PagedResponse[EmployerListItem]:
    """Employers, most recently submitted first. Filter with ?status=pending."""
    rows, total = admin_service.list_employers(db, status=status, page=page, page_size=page_size)
    return PagedResponse(
        data=[
            EmployerListItem(
                id=row.employer.id,
                company_name=row.employer.company_name,
                owner_email=row.owner_email,
                district_name=row.district_name,
                verification_status=row.employer.verification_status,
                submitted_at=row.employer.submitted_at,
                decided_at=row.employer.decided_at,
            )
            for row in rows
        ],
        meta=PageMeta(page=page, page_size=page_size, total=total),
    )


@router.get("/{employer_id}", responses=error_responses(401, 403, 404, 422))
def get_employer(
    employer_id: uuid.UUID, admin: AdminUser, db: DbSession
) -> DataResponse[EmployerDetail]:
    """The company profile with its verification history."""
    return _detail_out(admin_service.get_detail(db, employer_id))


@router.post(
    "/{employer_id}/approve",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409),
)
def approve(
    employer_id: uuid.UUID, request: Request, admin: AdminUser, db: DbSession
) -> DataResponse[EmployerDetail]:
    """Pending to approved, or suspended back to approved."""
    view = admin_service.decide(db, employer_id, S.APPROVED, admin=admin, ip=client_ip(request))
    return _detail_out(view)


@router.post(
    "/{employer_id}/reject",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409, 422),
)
def reject(
    employer_id: uuid.UUID, body: ReasonIn, request: Request, admin: AdminUser, db: DbSession
) -> DataResponse[EmployerDetail]:
    """Pending to rejected. The reason is required and shown to the employer."""
    view = admin_service.decide(
        db, employer_id, S.REJECTED, admin=admin, reason=body.reason, ip=client_ip(request)
    )
    return _detail_out(view)


@router.post(
    "/{employer_id}/suspend",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409, 422),
)
def suspend(
    employer_id: uuid.UUID, body: ReasonIn, request: Request, admin: AdminUser, db: DbSession
) -> DataResponse[EmployerDetail]:
    """Approved to suspended. Blocks new publishing; nothing already published is removed."""
    view = admin_service.decide(
        db, employer_id, S.SUSPENDED, admin=admin, reason=body.reason, ip=client_ip(request)
    )
    return _detail_out(view)

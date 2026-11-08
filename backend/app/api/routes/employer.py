"""The employer's own company profile. Private: no employer id in any URL."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.api.deps import DbSession, client_ip, require_csrf, require_role, require_verified_email
from app.models import Employer, User, UserRole
from app.schemas.common import DataResponse, error_responses
from app.schemas.employer import EmployerIn, EmployerOut
from app.services import employers as employer_service

router = APIRouter(prefix="/employer", tags=["employer"])

# Employers only. The profile is always looked up by the logged-in user's own id.
EmployerUser = Annotated[User, Depends(require_role(UserRole.EMPLOYER))]


def verified_employer(user: EmployerUser) -> User:
    """An employer whose email is verified (submitting needs it)."""
    return require_verified_email(user)


VerifiedEmployerUser = Annotated[User, Depends(verified_employer)]


def _out(db: DbSession, employer: Employer) -> DataResponse[EmployerOut]:
    return DataResponse(
        data=EmployerOut.build(
            employer,
            employer_service.status_reason(db, employer),
            employer_service.can_publish(employer),
        )
    )


@router.get("/me", responses=error_responses(401, 403, 404))
def get_my_employer(user: EmployerUser, db: DbSession) -> DataResponse[EmployerOut]:
    return _out(db, employer_service.get_my_employer(db, user))


@router.put(
    "/me",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 409, 422),
)
def put_my_employer(
    body: EmployerIn, request: Request, user: EmployerUser, db: DbSession
) -> DataResponse[EmployerOut]:
    """Create the company profile (a draft) or edit it. The verification status is not editable."""
    employer = employer_service.upsert_my_employer(db, user, body, ip=client_ip(request))
    return _out(db, employer)


@router.post(
    "/me/submit",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404, 409, 422),
)
def submit_my_employer(
    request: Request, user: VerifiedEmployerUser, db: DbSession
) -> DataResponse[EmployerOut]:
    """Send a complete profile for verification (draft or rejected -> pending)."""
    employer = employer_service.submit_my_employer(db, user, ip=client_ip(request))
    return _out(db, employer)

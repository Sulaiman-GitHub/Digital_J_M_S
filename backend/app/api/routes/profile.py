"""The job seeker's own profile. Private: there is no way to address anyone else's."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DbSession, require_csrf, require_role
from app.models import User, UserRole
from app.schemas.common import DataResponse, error_responses
from app.schemas.profile import ProfileIn, ProfileOut
from app.services import profiles as profile_service
from app.services.profiles import ProfileView

router = APIRouter(prefix="/profile", tags=["profile"])

# Job seekers only. The profile is always looked up by the logged-in user's own id.
SeekerUser = Annotated[User, Depends(require_role(UserRole.JOB_SEEKER))]


def _out(view: ProfileView) -> DataResponse[ProfileOut]:
    return DataResponse(data=ProfileOut.build(view.profile, view.skills, view.experiences))


@router.get("/me", responses=error_responses(401, 403, 404))
def get_my_profile(user: SeekerUser, db: DbSession) -> DataResponse[ProfileOut]:
    return _out(profile_service.get_my_profile(db, user))


@router.put(
    "/me",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 422),
)
def put_my_profile(body: ProfileIn, user: SeekerUser, db: DbSession) -> DataResponse[ProfileOut]:
    """Create the profile, or replace it entirely (skills and experiences included)."""
    return _out(profile_service.upsert_my_profile(db, user, body))

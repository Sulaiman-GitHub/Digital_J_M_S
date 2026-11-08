"""The signed-in user's own consents. Nothing here addresses another user."""

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, DbSession, require_csrf
from app.models import Consent
from app.schemas.common import DataResponse, error_responses
from app.schemas.consent import ConsentIn, ConsentOut
from app.services import consents as consent_service

router = APIRouter(prefix="/consents", tags=["consents"])


def _out(consents: list[Consent]) -> DataResponse[list[ConsentOut]]:
    return DataResponse(data=[ConsentOut.from_consent(item) for item in consents])


@router.get("/me", responses=error_responses(401))
def my_consents(user: CurrentUser, db: DbSession) -> DataResponse[list[ConsentOut]]:
    """The consents that are active now."""
    return _out(consent_service.list_active(db, user))


@router.post(
    "",
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 422),
)
def record_consent(
    body: ConsentIn, user: CurrentUser, db: DbSession
) -> DataResponse[list[ConsentOut]]:
    """Give (`granted: true`) or withdraw (`granted: false`) a consent. Returns the active ones."""
    if body.granted:
        consent_service.grant(db, user, body.consent_type)
    else:
        consent_service.revoke(db, user, body.consent_type)
    return _out(consent_service.list_active(db, user))

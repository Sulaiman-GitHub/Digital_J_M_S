"""The caller's own account data: export, and delete."""

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.cookies import clear_auth_cookies
from app.api.deps import CurrentUser, DbSession, FileStorageDep, client_ip, require_csrf
from app.core.rate_limit import auth_rate_limit, limiter
from app.schemas.common import DataResponse, error_responses
from app.services import account as account_service
from app.services import cvs as cv_service

router = APIRouter(prefix="/account", tags=["account"])


class DeleteAccountIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str = Field(min_length=1, max_length=1000)


@router.get("/export", responses=error_responses(401))
def export_my_data(
    request: Request, user: CurrentUser, db: DbSession, response: Response
) -> DataResponse[dict]:
    """Everything stored about the caller as JSON (never anyone else's data)."""
    response.headers["Cache-Control"] = "private, no-store"
    return DataResponse(data=account_service.export_data(db, user, ip=client_ip(request)))


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 409, 422, 429),
)
@limiter.limit(auth_rate_limit)
def delete_my_account(
    request: Request,
    body: DeleteAccountIn,
    user: CurrentUser,
    db: DbSession,
    storage: FileStorageDep,
    background: BackgroundTasks,
) -> Response:
    """Delete the account after the password is entered again. Cannot be undone."""
    keys = account_service.delete_account(db, user, body.password, ip=client_ip(request))
    for key in keys:
        background.add_task(cv_service.remove_file_safely, storage, key)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(response)
    return response

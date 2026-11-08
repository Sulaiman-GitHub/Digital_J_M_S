"""The job seeker's own CV. Private: there is no way to address anyone else's."""

import re
import unicodedata
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession, FileStorageDep, require_csrf, require_role
from app.core.config import get_settings
from app.core.rate_limit import limiter, upload_rate_limit
from app.models import User, UserRole
from app.schemas.common import DataResponse, error_responses
from app.schemas.cv import CvOut
from app.services import cvs as cv_service

router = APIRouter(prefix="/cv", tags=["cv"])

# Job seekers only. The CV is always looked up by the logged-in user's own id.
SeekerUser = Annotated[User, Depends(require_role(UserRole.JOB_SEEKER))]


def attachment_headers(filename: str, size_bytes: int) -> dict[str, str]:
    """Headers that make the browser save the file instead of showing or running it.

    The name was cleaned on upload (no line breaks, no quotes). It is sent twice: a plain ASCII
    fallback for old clients and the exact name as RFC 5987 UTF-8. The storage path never
    appears here.
    """
    ascii_name = unicodedata.normalize("NFKD", filename).encode("ascii", "ignore").decode()
    fallback = re.sub(r"[^A-Za-z0-9._ -]", "_", ascii_name).strip(" .") or "cv"
    return {
        "Content-Disposition": (
            f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename, safe='')}"
        ),
        "Content-Length": str(size_bytes),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
    }


@router.get("/me", responses=error_responses(401, 403, 404))
def get_my_cv(user: SeekerUser, db: DbSession) -> DataResponse[CvOut]:
    """Metadata only (name, type, size, date). The file itself is at /cv/me/download."""
    return DataResponse(data=CvOut.model_validate(cv_service.get_my_cv(db, user)))


@router.post(
    "/me",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 413, 415, 422, 429, 503),
)
@limiter.limit(upload_rate_limit)
def upload_my_cv(
    request: Request,
    file: Annotated[UploadFile, File(description="A PDF or Word file, at most 5 MB")],
    user: SeekerUser,
    db: DbSession,
    storage: FileStorageDep,
    background: BackgroundTasks,
) -> DataResponse[CvOut]:
    """Upload a CV, replacing the current one. The old file is removed after the commit."""
    stored = cv_service.store_cv(
        db,
        storage,
        user,
        filename=file.filename,
        stream=file.file,
        max_bytes=get_settings().max_cv_bytes,
    )
    if stored.replaced_key:
        background.add_task(cv_service.remove_file_safely, storage, stored.replaced_key)
    return DataResponse(data=CvOut.model_validate(stored.cv))


@router.delete(
    "/me",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404),
)
def delete_my_cv(
    user: SeekerUser,
    db: DbSession,
    storage: FileStorageDep,
    background: BackgroundTasks,
) -> Response:
    key = cv_service.delete_my_cv(db, user)
    background.add_task(cv_service.remove_file_safely, storage, key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/me/download",
    response_class=StreamingResponse,
    responses={
        200: {"description": "The CV file", "content": {"application/octet-stream": {}}},
        **error_responses(401, 403, 404, 503),
    },
)
def download_my_cv(user: SeekerUser, db: DbSession, storage: FileStorageDep) -> StreamingResponse:
    cv = cv_service.get_my_cv(db, user)
    stream = cv_service.open_cv_file(storage, cv)
    return StreamingResponse(
        cv_service.iter_file(stream),
        media_type=cv.content_type,
        headers=attachment_headers(cv.original_filename, cv.size_bytes),
    )

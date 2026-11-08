"""Profile photos and company logos.

- Own picture, like the CV: `/photo/me` (job seekers) and `/logo/me` (employers), with no id in
  the URL. `/…/image` returns the picture itself.
- Public: `/vacancies/{vacancy_id}/logo` serves the logo of the company behind a live vacancy.
- Employers: `/employer/applications/{application_id}/photo` serves the photo of a person who
  applied to one of their vacancies.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse

from app.api.deps import DbSession, FileStorageDep, require_csrf, require_role
from app.core.config import get_settings
from app.core.rate_limit import limiter, upload_rate_limit
from app.models import ImageKind, User, UserImage, UserRole
from app.schemas.common import DataResponse, error_responses
from app.schemas.image import ImageOut
from app.services import applications as application_service
from app.services import cvs as cv_service
from app.services import images as image_service

router = APIRouter(tags=["images"])

SeekerUser = Annotated[User, Depends(require_role(UserRole.JOB_SEEKER))]
EmployerUser = Annotated[User, Depends(require_role(UserRole.EMPLOYER))]

_PRIVATE = "private, no-cache"
_PUBLIC = "public, max-age=300"


def _image_response(
    storage: FileStorageDep, image: UserImage, cache_control: str
) -> StreamingResponse:
    stream = image_service.open_image_file(storage, image)
    return StreamingResponse(
        cv_service.iter_file(stream),
        media_type=image.content_type,
        headers={
            "Content-Length": str(image.size_bytes),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": cache_control,
        },
    )


_IMAGE_BYTES = {200: {"description": "The picture", "content": {"image/*": {}}}}


# --- A job seeker's own photo ---------------------------------------------------------------


@router.get("/photo/me", responses=error_responses(401, 403, 404))
def get_my_photo(user: SeekerUser, db: DbSession) -> DataResponse[ImageOut]:
    """Details of the photo (type, size, date). The picture itself is at /photo/me/image."""
    image = image_service.get_my_image(db, user, ImageKind.PHOTO)
    return DataResponse(data=ImageOut.model_validate(image))


@router.post(
    "/photo/me",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 413, 415, 422, 429, 503),
)
@limiter.limit(upload_rate_limit)
def upload_my_photo(
    request: Request,
    file: Annotated[UploadFile, File(description="A JPEG, PNG or WebP picture, at most 2 MB")],
    user: SeekerUser,
    db: DbSession,
    storage: FileStorageDep,
    background: BackgroundTasks,
) -> DataResponse[ImageOut]:
    stored = image_service.store_image(
        db,
        storage,
        user,
        ImageKind.PHOTO,
        stream=file.file,
        max_bytes=get_settings().max_image_bytes,
    )
    if stored.replaced_key:
        background.add_task(cv_service.remove_file_safely, storage, stored.replaced_key)
    return DataResponse(data=ImageOut.model_validate(stored.image))


@router.delete(
    "/photo/me",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404),
)
def delete_my_photo(
    user: SeekerUser, db: DbSession, storage: FileStorageDep, background: BackgroundTasks
) -> Response:
    key = image_service.delete_my_image(db, user, ImageKind.PHOTO)
    background.add_task(cv_service.remove_file_safely, storage, key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/photo/me/image",
    response_class=StreamingResponse,
    responses={**_IMAGE_BYTES, **error_responses(401, 403, 404, 503)},
)
def my_photo_image(user: SeekerUser, db: DbSession, storage: FileStorageDep) -> StreamingResponse:
    image = image_service.get_my_image(db, user, ImageKind.PHOTO)
    return _image_response(storage, image, _PRIVATE)


# --- An employer's own logo -----------------------------------------------------------------


@router.get("/logo/me", responses=error_responses(401, 403, 404))
def get_my_logo(user: EmployerUser, db: DbSession) -> DataResponse[ImageOut]:
    image = image_service.get_my_image(db, user, ImageKind.LOGO)
    return DataResponse(data=ImageOut.model_validate(image))


@router.post(
    "/logo/me",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 413, 415, 422, 429, 503),
)
@limiter.limit(upload_rate_limit)
def upload_my_logo(
    request: Request,
    file: Annotated[UploadFile, File(description="A JPEG, PNG or WebP picture, at most 2 MB")],
    user: EmployerUser,
    db: DbSession,
    storage: FileStorageDep,
    background: BackgroundTasks,
) -> DataResponse[ImageOut]:
    stored = image_service.store_image(
        db,
        storage,
        user,
        ImageKind.LOGO,
        stream=file.file,
        max_bytes=get_settings().max_image_bytes,
    )
    if stored.replaced_key:
        background.add_task(cv_service.remove_file_safely, storage, stored.replaced_key)
    return DataResponse(data=ImageOut.model_validate(stored.image))


@router.delete(
    "/logo/me",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_csrf)],
    responses=error_responses(401, 403, 404),
)
def delete_my_logo(
    user: EmployerUser, db: DbSession, storage: FileStorageDep, background: BackgroundTasks
) -> Response:
    key = image_service.delete_my_image(db, user, ImageKind.LOGO)
    background.add_task(cv_service.remove_file_safely, storage, key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/logo/me/image",
    response_class=StreamingResponse,
    responses={**_IMAGE_BYTES, **error_responses(401, 403, 404, 503)},
)
def my_logo_image(user: EmployerUser, db: DbSession, storage: FileStorageDep) -> StreamingResponse:
    image = image_service.get_my_image(db, user, ImageKind.LOGO)
    return _image_response(storage, image, _PRIVATE)


# --- Public logo, and the applicant's photo for the employer ---------------------------------


@router.get(
    "/vacancies/{vacancy_id}/logo",
    response_class=StreamingResponse,
    responses={**_IMAGE_BYTES, **error_responses(404, 422, 503)},
)
def company_logo(vacancy_id: uuid.UUID, db: DbSession, storage: FileStorageDep):
    """The logo of the company behind a live vacancy (the company's id is never exposed)."""
    image = image_service.public_logo(db, vacancy_id)
    return _image_response(storage, image, _PUBLIC)


@router.get(
    "/employer/applications/{application_id}/photo",
    response_class=StreamingResponse,
    responses={**_IMAGE_BYTES, **error_responses(401, 403, 404, 422, 503)},
)
def applicant_photo(
    application_id: uuid.UUID, user: EmployerUser, db: DbSession, storage: FileStorageDep
):
    """The photo of a person who applied to one of this company's vacancies. Nobody else's."""
    image = application_service.applicant_photo(db, user, application_id)
    return _image_response(storage, image, _PRIVATE)

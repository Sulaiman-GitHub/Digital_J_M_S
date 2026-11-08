"""Profile photos and company logos.

An image is always found through the caller's own user id, or (for a logo) through an approved
employer, or (for a photo) through an application the caller's company received. There is no
function here that takes an arbitrary user id from a client.
"""

import contextlib
import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.logging import get_logger
from app.integrations.storage import FileNotFoundInStorage, FileStorage, StorageError, new_key
from app.models import (
    Employer,
    ImageKind,
    User,
    UserImage,
    UserRole,
    Vacancy,
    VerificationStatus,
)
from app.services.image_files import detect_image_type
from app.services.vacancies import live_clause

logger = get_logger("images")
_CHUNK_BYTES = 64 * 1024


@dataclass(frozen=True)
class StoredImage:
    image: UserImage
    # The file of the image this one replaced. Remove it only AFTER the commit.
    replaced_key: str | None


def kind_for(user: User) -> ImageKind:
    """Job seekers have a photo, employers a logo; anyone else has neither."""
    if user.role is UserRole.JOB_SEEKER:
        return ImageKind.PHOTO
    if user.role is UserRole.EMPLOYER:
        return ImageKind.LOGO
    raise AppError("forbidden", "You do not have access to this.", status=403)


def _not_found(kind: ImageKind) -> AppError:
    what = "photo" if kind is ImageKind.PHOTO else "logo"
    return AppError(f"{what}_not_found", f"You have not uploaded a {what} yet.", status=404)


def active_image(db: Session, user_id: uuid.UUID, kind: ImageKind) -> UserImage | None:
    return db.scalar(
        select(UserImage).where(
            UserImage.user_id == user_id,
            UserImage.kind == kind,
            UserImage.deleted_at.is_(None),
        )
    )


def get_my_image(db: Session, user: User, kind: ImageKind) -> UserImage:
    image = active_image(db, user.id, kind)
    if image is None:
        raise _not_found(kind)
    return image


def _measure(stream: BinaryIO, max_bytes: int) -> tuple[int, str]:
    """Size and SHA-256, reading in chunks and stopping early if the file is too big."""
    stream.seek(0)
    digest = hashlib.sha256()
    total = 0
    while chunk := stream.read(_CHUNK_BYTES):
        total += len(chunk)
        if total > max_bytes:
            megabytes = max_bytes / (1024 * 1024)
            raise AppError(
                "file_too_large",
                f"This picture is too big. The limit is {megabytes:g} MB.",
                status=413,
            )
        digest.update(chunk)
    stream.seek(0)
    return total, digest.hexdigest()


def store_image(
    db: Session,
    storage: FileStorage,
    user: User,
    kind: ImageKind,
    *,
    stream: BinaryIO,
    max_bytes: int,
) -> StoredImage:
    """Check the picture, store it, and make it the user's one active image of this kind.

    Same order as CVs: cheap checks first, then the file is saved under a random key, then the
    old row is soft-deleted and the new one added. If anything after the save fails, the new
    file is removed again and the old image is untouched.
    """
    size, sha256 = _measure(stream, max_bytes)
    if size == 0:
        raise AppError("file_empty", "This file is empty. Choose your picture again.", status=422)
    image_type = detect_image_type(stream)
    if image_type is None:
        raise AppError(
            "unsupported_file_type",
            "Upload a JPEG, PNG or WebP picture.",
            status=415,
        )

    key = new_key()
    try:
        written = storage.save(key, stream)
        if written != size:
            raise StorageError("Stored size does not match the uploaded size")
    except StorageError:
        _remove_quietly(storage, key)
        logger.exception("Could not store an image file")
        raise AppError(
            "storage_unavailable", "We could not save your picture. Please try again.", 503
        ) from None

    try:
        # with_for_update serialises two uploads from the same user.
        previous = db.scalar(
            select(UserImage)
            .where(
                UserImage.user_id == user.id,
                UserImage.kind == kind,
                UserImage.deleted_at.is_(None),
            )
            .with_for_update()
        )
        replaced_key = None
        if previous is not None:
            previous.deleted_at = datetime.now(UTC)
            replaced_key = previous.storage_key
            db.flush()  # free the "one active image" slot before the new row goes in
        image = UserImage(
            user_id=user.id,
            kind=kind,
            storage_key=key,
            content_type=image_type.content_type,
            size_bytes=size,
            sha256=sha256,
        )
        db.add(image)
        db.flush()
    except IntegrityError:
        _remove_quietly(storage, key)
        raise AppError(
            "image_upload_conflict",
            "Another upload was in progress. Please try again.",
            status=409,
        ) from None
    except BaseException:
        _remove_quietly(storage, key)
        raise
    return StoredImage(image, replaced_key)


def delete_my_image(db: Session, user: User, kind: ImageKind) -> str:
    """Soft-delete the row and return its storage key (the route removes the file later)."""
    image = get_my_image(db, user, kind)
    image.deleted_at = datetime.now(UTC)
    db.flush()
    return image.storage_key


def logo_owner_ids(db: Session, vacancy_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Which of these vacancies belong to a company that has a logo (one query, for lists)."""
    if not vacancy_ids:
        return set()
    return set(
        db.scalars(
            select(Vacancy.id)
            .join(Employer, Employer.id == Vacancy.employer_id)
            .join(
                UserImage,
                (UserImage.user_id == Employer.owner_user_id)
                & (UserImage.kind == ImageKind.LOGO)
                & UserImage.deleted_at.is_(None),
            )
            .where(Vacancy.id.in_(vacancy_ids))
        )
    )


def logo_url(vacancy_id: uuid.UUID) -> str:
    return f"/api/v1/vacancies/{vacancy_id}/logo"


def public_logo(db: Session, vacancy_id: uuid.UUID) -> UserImage:
    """The logo of the company behind a live vacancy, if the company is approved. A logo is
    public only because the vacancy is; the company's id is never in the address. Anything else
    (no such vacancy, not live, company not approved, no logo): 404."""
    owner_id = db.scalar(
        select(Employer.owner_user_id)
        .join(Vacancy, Vacancy.employer_id == Employer.id)
        .where(
            Vacancy.id == vacancy_id,
            live_clause(),
            Employer.verification_status == VerificationStatus.APPROVED,
        )
    )
    image = active_image(db, owner_id, ImageKind.LOGO) if owner_id else None
    if image is None:
        raise AppError("logo_not_found", "This company has no logo.", status=404)
    return image


def photo_of_user(db: Session, user_id: uuid.UUID) -> UserImage:
    """A job seeker's photo. Only for callers that already proved the right to see it."""
    image = active_image(db, user_id, ImageKind.PHOTO)
    if image is None:
        raise AppError("photo_not_found", "This applicant has no photo.", status=404)
    return image


def open_image_file(storage: FileStorage, image: UserImage) -> BinaryIO:
    try:
        return storage.open(image.storage_key)
    except FileNotFoundInStorage:
        logger.error("An image row points at a file that is missing from storage")
        raise AppError(
            "image_file_missing",
            "We could not find the picture. It may need to be uploaded again.",
            status=404,
        ) from None
    except StorageError:
        logger.exception("Could not open an image file")
        raise AppError(
            "storage_unavailable", "We could not read the picture. Please try again.", 503
        ) from None


def _remove_quietly(storage: FileStorage, key: str) -> None:
    with contextlib.suppress(StorageError):
        storage.delete(key)

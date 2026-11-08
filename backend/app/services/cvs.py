"""A job seeker's CV.

A CV is always found through the caller's own user id. There is no id in any URL and no function
here that returns someone else's CV, so ownership cannot be got wrong by a caller.
"""

import contextlib
import hashlib
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import BinaryIO

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.logging import get_logger
from app.integrations.storage import FileNotFoundInStorage, FileStorage, StorageError, new_key
from app.models import Cv, User
from app.services.cv_files import (
    FALLBACK_STEM,
    KINDS,
    CvKind,
    clean_filename,
    content_matches,
    split_extension,
)

logger = get_logger("cvs")
_CHUNK_BYTES = 64 * 1024
DOWNLOAD_CHUNK_BYTES = 64 * 1024


@dataclass(frozen=True)
class StoredCv:
    cv: Cv
    # The file of the CV this one replaced. Remove it only AFTER the database change is committed.
    replaced_key: str | None


def _unsupported(message: str, code: str = "unsupported_file_type") -> AppError:
    return AppError(code, message, status=415)


def get_active_cv(db: Session, user: User) -> Cv | None:
    return db.scalar(select(Cv).where(Cv.user_id == user.id, Cv.deleted_at.is_(None)))


def get_my_cv(db: Session, user: User) -> Cv:
    cv = get_active_cv(db, user)
    if cv is None:
        raise AppError("cv_not_found", "You have not uploaded a CV yet.", status=404)
    return cv


def _checked_kind(filename: str | None) -> tuple[str, CvKind]:
    """The display name and file kind, or 415. Looks only at the (cleaned) name."""
    stem, extension = split_extension(clean_filename(filename))
    kind = KINDS.get(extension) if extension else None
    if kind is None:
        raise _unsupported("Upload a PDF or Word file (.pdf, .doc or .docx).")
    return f"{stem or FALLBACK_STEM}.{kind.extension}", kind


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
                f"This file is too big. The limit is {megabytes:g} MB.",
                status=413,
            )
        digest.update(chunk)
    stream.seek(0)
    return total, digest.hexdigest()


def store_cv(
    db: Session,
    storage: FileStorage,
    user: User,
    *,
    filename: str | None,
    stream: BinaryIO,
    max_bytes: int,
) -> StoredCv:
    """Check the file, store it, and make it the user's one active CV.

    Order matters: cheap checks first (name, size, emptiness, contents); then the file is saved
    under a random key; then the old CV row is soft-deleted and the new one added. If anything
    after the save fails, the new file is removed again and the old CV is untouched.
    """
    display_name, kind = _checked_kind(filename)
    size, sha256 = _measure(stream, max_bytes)
    if size == 0:
        raise AppError("file_empty", "This file is empty. Choose your CV file again.", status=422)
    if not content_matches(kind.extension, stream):
        raise _unsupported(
            f"This file is not a real {kind.label} document, "
            f"even though it is named .{kind.extension}.",
            code="file_type_mismatch",
        )

    key = new_key()
    try:
        written = storage.save(key, stream)
        if written != size:  # the file changed while we read it, or the disk misbehaved
            raise StorageError("Stored size does not match the uploaded size")
    except StorageError:
        _remove_quietly(storage, key)
        logger.exception("Could not store a CV file")
        raise AppError(
            "storage_unavailable", "We could not save your file. Please try again.", 503
        ) from None

    try:
        # with_for_update serialises two uploads from the same user.
        previous = db.scalar(
            select(Cv).where(Cv.user_id == user.id, Cv.deleted_at.is_(None)).with_for_update()
        )
        replaced_key = None
        if previous is not None:
            previous.deleted_at = datetime.now(UTC)
            replaced_key = previous.storage_key
            db.flush()  # free the "one active CV" slot before the new row goes in
        cv = Cv(
            user_id=user.id,
            original_filename=display_name,
            storage_key=key,
            content_type=kind.content_type,
            size_bytes=size,
            sha256=sha256,
        )
        db.add(cv)
        db.flush()
    except IntegrityError:
        _remove_quietly(storage, key)
        raise AppError(
            "cv_upload_conflict",
            "Another upload was in progress. Please try again.",
            status=409,
        ) from None
    except BaseException:
        _remove_quietly(storage, key)
        raise
    return StoredCv(cv, replaced_key)


def delete_my_cv(db: Session, user: User) -> str:
    """Soft-delete the CV row and return its storage key (the route removes the file later)."""
    cv = get_my_cv(db, user)
    cv.deleted_at = datetime.now(UTC)
    db.flush()
    return cv.storage_key


def open_cv_file(storage: FileStorage, cv: Cv) -> BinaryIO:
    return open_stored_file(storage, cv.storage_key)


def open_stored_file(storage: FileStorage, key: str) -> BinaryIO:
    """Open a stored CV file (a CV's own, or an application's copy) or raise a clean error."""
    try:
        return storage.open(key)
    except FileNotFoundInStorage:
        logger.error("A CV row points at a file that is missing from storage")
        raise AppError(
            "cv_file_missing",
            "We could not find the CV file. It may need to be uploaded again.",
            status=404,
        ) from None
    except StorageError:
        logger.exception("Could not open a CV file")
        raise AppError(
            "storage_unavailable", "We could not read the file. Please try again.", 503
        ) from None


def iter_file(stream: BinaryIO, chunk_bytes: int = DOWNLOAD_CHUNK_BYTES) -> Iterator[bytes]:
    """Stream a file in chunks, then close it (also if the client disconnects)."""
    try:
        while chunk := stream.read(chunk_bytes):
            yield chunk
    finally:
        stream.close()


def _remove_quietly(storage: FileStorage, key: str) -> None:
    with contextlib.suppress(StorageError):
        storage.delete(key)


def remove_file_safely(storage: FileStorage, key: str) -> None:
    """Delete a stored file and never raise. For BackgroundTasks, after the commit.

    A failure leaves an orphan file (logged by key only); it cannot be reached by any user.
    """
    try:
        storage.delete(key)
    except StorageError:
        logger.error("Could not remove a stored file (key %s...)", key[:8])

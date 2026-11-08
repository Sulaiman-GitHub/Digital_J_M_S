"""Profile photos (job seekers) and company logos (employers)."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedUUIDMixin, str_enum


class ImageKind(enum.StrEnum):
    PHOTO = "photo"  # a job seeker's profile photo
    LOGO = "logo"  # an employer's company logo


class UserImage(TimestampedUUIDMixin, Base):
    """One image file. A user has at most one active image of each kind (deleted_at IS NULL).

    The role decides the kind: only job seekers have a photo, only employers have a logo (the
    service enforces it). Rows are soft-deleted; the file itself is removed from storage. As with
    CVs, whoever hard-deletes a user must delete their files first (account deletion does).
    """

    __tablename__ = "user_images"
    __table_args__ = (
        CheckConstraint("size_bytes > 0", name="size_positive"),
        CheckConstraint("char_length(sha256) = 64", name="sha256_length"),
        Index(
            "uq_user_images_user_id_kind_active",
            "user_id",
            "kind",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[ImageKind] = mapped_column(str_enum(ImageKind, "kind"), nullable=False)
    # Random 32-character key; the only name the file has on disk. Never sent to clients.
    storage_key: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    # Decided by the server from the checked file type, never copied from the client.
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

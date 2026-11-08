"""Uploaded CVs. Private: only the owner reads or downloads them in Phase 2."""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedUUIDMixin


class Cv(TimestampedUUIDMixin, Base):
    """One CV file. A user has at most one active row (deleted_at IS NULL).

    Rows are soft-deleted (deleted_at) so history is kept; the file itself is removed from
    storage. If a user row is ever hard-deleted, its CV rows go with it but the files would stay
    on disk: whoever deletes a user must delete their files first.
    """

    __tablename__ = "cvs"
    __table_args__ = (
        CheckConstraint("size_bytes > 0", name="size_positive"),
        CheckConstraint("char_length(sha256) = 64", name="sha256_length"),
        # One active CV per user. Deleted rows are not counted.
        Index(
            "uq_cvs_user_id_active",
            "user_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Shown to the user and used for downloads. Cleaned: no path, no control characters.
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # Random 32-character key; the only name the file has on disk. Never sent to clients.
    storage_key: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    # Decided by the server from the checked file type, never copied from the client.
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

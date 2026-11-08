"""Vacancies a job seeker has bookmarked."""

import uuid

from sqlalchemy import ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedUUIDMixin


class SavedVacancy(TimestampedUUIDMixin, Base):
    """One job seeker's bookmark of one vacancy. Private: only the owner ever reads it.

    A user can save a vacancy once (unique constraint). The row goes when the user or the vacancy
    is deleted; a vacancy that is no longer live stays saved but is simply not listed.
    """

    __tablename__ = "saved_vacancies"
    __table_args__ = (
        UniqueConstraint("user_id", "vacancy_id"),
        # "My saved jobs, newest first".
        Index("ix_saved_vacancies_user_id_created_at", "user_id", "created_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    vacancy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), nullable=False, index=True
    )

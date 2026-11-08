"""Reports of vacancies by users."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampedUUIDMixin, str_enum


class ReportReason(enum.StrEnum):
    SCAM_OR_FEE = "scam_or_fee"
    FAKE_EMPLOYER = "fake_employer"
    MISLEADING = "misleading"
    DISCRIMINATORY = "discriminatory"
    OTHER = "other"


class ReportStatus(enum.StrEnum):
    OPEN = "open"
    ACTIONED = "actioned"
    DISMISSED = "dismissed"


class VacancyReport(TimestampedUUIDMixin, Base):
    """One user's report of one vacancy.

    A user can have only one open report per vacancy (partial unique index). If the reporter's
    account is erased the report stays, with reporter_user_id NULL.
    """

    __tablename__ = "vacancy_reports"
    __table_args__ = (
        Index(
            "uq_vacancy_reports_vacancy_reporter_open",
            "vacancy_id",
            "reporter_user_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
        Index("ix_vacancy_reports_status_created_at", "status", "created_at"),
    )

    vacancy_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("vacancies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reporter_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    reason: Mapped[ReportReason] = mapped_column(
        str_enum(ReportReason, "report_reason"), nullable=False
    )
    details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ReportStatus] = mapped_column(
        str_enum(ReportStatus, "report_status"),
        nullable=False,
        default=ReportStatus.OPEN,
        server_default=ReportStatus.OPEN.value,
    )
    handled_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    handled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

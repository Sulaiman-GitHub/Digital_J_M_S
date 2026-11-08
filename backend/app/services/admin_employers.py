"""Admin side of employer verification.

The decisions use the same `change_status` as the employer's own actions, so the transition table
and the history and audit rules are in one place only.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    District,
    Employer,
    EmployerVerificationEvent,
    User,
    VerificationStatus,
)
from app.services.employers import change_status


@dataclass(frozen=True)
class ListRow:
    employer: Employer
    owner_email: str
    district_name: str


@dataclass(frozen=True)
class HistoryRow:
    event: EmployerVerificationEvent
    actor_email: str | None


@dataclass(frozen=True)
class DetailView:
    employer: Employer
    owner: User
    district_name: str
    history: list[HistoryRow]


def list_employers(
    db: Session, *, status: VerificationStatus | None, page: int, page_size: int
) -> tuple[list[ListRow], int]:
    """A page of employers, most recently submitted first (never-submitted drafts last)."""
    filters = [Employer.verification_status == status] if status is not None else []
    total = db.scalar(select(func.count()).select_from(Employer).where(*filters)) or 0
    rows = db.execute(
        select(Employer, User.email, District.name)
        .join(User, User.id == Employer.owner_user_id)
        .join(District, District.id == Employer.district_id)
        .where(*filters)
        .order_by(
            Employer.submitted_at.desc().nulls_last(),
            Employer.created_at.desc(),
            Employer.id,
        )
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    return [ListRow(employer, email, district) for employer, email, district in rows], total


def _load(db: Session, employer_id: uuid.UUID, *, lock: bool = False) -> Employer:
    statement = select(Employer).where(Employer.id == employer_id)
    if lock:
        statement = statement.with_for_update()  # two admins cannot decide at the same moment
    employer = db.scalar(statement)
    if employer is None:
        raise AppError("employer_not_found", "This employer does not exist.", status=404)
    return employer


def get_detail(db: Session, employer_id: uuid.UUID) -> DetailView:
    return _detail(db, _load(db, employer_id))


def _detail(db: Session, employer: Employer) -> DetailView:
    owner = db.get_one(User, employer.owner_user_id)
    district = db.get_one(District, employer.district_id)
    events = db.execute(
        select(EmployerVerificationEvent, User.email)
        .outerjoin(User, User.id == EmployerVerificationEvent.actor_user_id)
        .where(EmployerVerificationEvent.employer_id == employer.id)
        .order_by(EmployerVerificationEvent.created_at, EmployerVerificationEvent.id)
    ).all()
    history = [HistoryRow(event, email) for event, email in events]
    return DetailView(employer, owner, district.name, history)


def decide(
    db: Session,
    employer_id: uuid.UUID,
    to_status: VerificationStatus,
    *,
    admin: User,
    reason: str | None = None,
    ip: str | None = None,
) -> DetailView:
    """Approve, reject or suspend. Raises 409 if the table does not allow it, and 422 without a
    reason where one is required."""
    employer = _load(db, employer_id, lock=True)
    change_status(db, employer, to_status, actor=admin, reason=reason, ip=ip)
    return _detail(db, employer)

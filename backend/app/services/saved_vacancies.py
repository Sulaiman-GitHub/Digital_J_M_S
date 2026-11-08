"""Saved jobs: a job seeker's bookmarks.

Everything is found through the caller's own user id; no function takes another user's id.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import District, Employer, SavedVacancy, User, Vacancy
from app.schemas.public_vacancy import VacancyCard
from app.services.public_vacancies import cards_from_rows
from app.services.vacancies import live_clause

# More than a person needs; stops a script from filling the table.
MAX_SAVED = 200


def _live_vacancy_exists(db: Session, vacancy_id: uuid.UUID) -> bool:
    return db.scalar(select(Vacancy.id).where(Vacancy.id == vacancy_id, live_clause())) is not None


def save(db: Session, user: User, vacancy_id: uuid.UUID) -> None:
    """Bookmark a live vacancy. Saving it again does nothing (safe to repeat)."""
    if not _live_vacancy_exists(db, vacancy_id):
        raise AppError("vacancy_not_found", "This vacancy does not exist.", status=404)
    already = db.scalar(
        select(SavedVacancy.id).where(
            SavedVacancy.user_id == user.id, SavedVacancy.vacancy_id == vacancy_id
        )
    )
    if already is not None:
        return
    count = db.scalar(
        select(func.count()).select_from(SavedVacancy).where(SavedVacancy.user_id == user.id)
    )
    if (count or 0) >= MAX_SAVED:
        raise AppError(
            "saved_limit",
            f"You can save up to {MAX_SAVED} jobs. Remove some to save more.",
            status=409,
        )
    # ON CONFLICT: two taps at once must not become an error.
    db.execute(
        insert(SavedVacancy)
        # clock_timestamp(), not the transaction's now(): the saving order must always be exact.
        .values(user_id=user.id, vacancy_id=vacancy_id, created_at=func.clock_timestamp())
        .on_conflict_do_nothing(index_elements=["user_id", "vacancy_id"])
    )
    db.flush()


def unsave(db: Session, user: User, vacancy_id: uuid.UUID) -> None:
    """Remove a bookmark. Not an error if it was not saved."""
    row = db.scalar(
        select(SavedVacancy).where(
            SavedVacancy.user_id == user.id, SavedVacancy.vacancy_id == vacancy_id
        )
    )
    if row is not None:
        db.delete(row)
        db.flush()


def saved_ids(db: Session, user: User) -> list[uuid.UUID]:
    """The live vacancies the caller has saved (for showing a filled bookmark on cards)."""
    return list(
        db.scalars(
            select(SavedVacancy.vacancy_id)
            .join(Vacancy, Vacancy.id == SavedVacancy.vacancy_id)
            .where(SavedVacancy.user_id == user.id, live_clause())
            .order_by(SavedVacancy.created_at.desc())
            .limit(MAX_SAVED)
        )
    )


def list_saved(
    db: Session, user: User, *, page: int, page_size: int
) -> tuple[list[VacancyCard], int]:
    """The caller's saved vacancies that are still live, most recently saved first. Vacancies
    that have closed or expired stay saved but are not listed."""
    where = (SavedVacancy.user_id == user.id, live_clause())
    total = (
        db.scalar(
            select(func.count())
            .select_from(SavedVacancy)
            .join(Vacancy, Vacancy.id == SavedVacancy.vacancy_id)
            .where(*where)
        )
        or 0
    )
    rows = db.execute(
        select(Vacancy, Employer.company_name, District.name)
        .join(SavedVacancy, SavedVacancy.vacancy_id == Vacancy.id)
        .join(Employer, Employer.id == Vacancy.employer_id)
        .outerjoin(District, District.id == Vacancy.district_id)
        .where(*where)
        .order_by(SavedVacancy.created_at.desc(), Vacancy.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    return cards_from_rows(db, rows), total

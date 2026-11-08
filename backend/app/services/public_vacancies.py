"""Public vacancy search and detail.

Everything here goes through `live_clause()`: only published, unexpired vacancies are ever visible.
A vacancy that is a draft, closed or expired is simply "not found".
"""

import enum
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    District,
    Employer,
    EmploymentType,
    QualificationLevel,
    Vacancy,
    VacancyRequirement,
    WorkArrangement,
)
from app.schemas.public_vacancy import PublicEmployer, VacancyCard, VacancyDetail
from app.schemas.vacancy import RequirementOut
from app.services.images import logo_owner_ids, logo_url
from app.services.vacancies import live_clause, requirements_of

Q_MAX_LENGTH = 200


class Sort(enum.StrEnum):
    RELEVANCE = "relevance"
    NEWEST = "newest"


@dataclass(frozen=True)
class SearchFilters:
    q: str | None = None
    district_id: uuid.UUID | None = None
    qualification_level_id: uuid.UUID | None = None
    employment_type: EmploymentType | None = None
    work_arrangement: WorkArrangement | None = None
    sort: Sort | None = None


def _not_found() -> AppError:
    return AppError("vacancy_not_found", "This vacancy does not exist.", status=404)


def _field_error(field: str, message: str) -> AppError:
    return AppError(
        "validation_error",
        "Some fields are invalid.",
        status=422,
        details={"fields": {field: message}},
    )


def _salary(vacancy: Vacancy) -> tuple[int | None, int | None]:
    if not vacancy.show_salary:
        return None, None
    return vacancy.salary_min, vacancy.salary_max


def _filters(db: Session, f: SearchFilters) -> tuple[list[ColumnElement[bool]], bool]:
    """The WHERE conditions, and whether a text search is part of them."""
    conditions: list[ColumnElement[bool]] = [live_clause()]
    if f.district_id is not None:
        if db.get(District, f.district_id) is None:
            raise _field_error("district_id", "Choose a district from the list.")
        conditions.append(Vacancy.district_id == f.district_id)
    if f.qualification_level_id is not None:
        level = db.get(QualificationLevel, f.qualification_level_id)
        if level is None:
            raise _field_error("qualification_level_id", "Choose a qualification level.")
        # Vacancies that ask for nothing, or for a level at or below the one chosen.
        conditions.append(
            or_(
                Vacancy.min_qualification_level_id.is_(None),
                Vacancy.min_qualification_level_id.in_(
                    select(QualificationLevel.id).where(QualificationLevel.rank <= level.rank)
                ),
            )
        )
    if f.employment_type is not None:
        conditions.append(Vacancy.employment_type == f.employment_type)
    if f.work_arrangement is not None:
        conditions.append(Vacancy.work_arrangement == f.work_arrangement)
    text_query = (f.q or "").strip()
    if text_query:
        conditions.append(
            Vacancy.search_vector.op("@@")(func.websearch_to_tsquery("english", text_query))
        )
    return conditions, bool(text_query)


def search_statements(
    db: Session, f: SearchFilters
) -> tuple[Select[tuple[Vacancy, str, str | None]], Select[tuple[int]]]:
    """The list query (unpaged) and the count query. Exposed so query plans can be checked."""
    conditions, searching = _filters(db, f)
    count = select(func.count()).select_from(Vacancy).where(*conditions)
    statement: Select[tuple[Vacancy, str, str | None]] = (
        select(Vacancy, Employer.company_name, District.name)
        .join(Employer, Employer.id == Vacancy.employer_id)
        .outerjoin(District, District.id == Vacancy.district_id)
        .where(*conditions)
    )
    sort = f.sort or (Sort.RELEVANCE if searching else Sort.NEWEST)
    if sort == Sort.RELEVANCE and searching:
        rank = func.ts_rank(Vacancy.search_vector, func.websearch_to_tsquery("english", f.q))
        statement = statement.order_by(rank.desc(), Vacancy.published_at.desc(), Vacancy.id)
    else:  # newest, which is also what "relevance" means when there is nothing to search for
        statement = statement.order_by(Vacancy.published_at.desc(), Vacancy.id)
    return statement, count


def search(
    db: Session, f: SearchFilters, *, page: int, page_size: int
) -> tuple[list[VacancyCard], int]:
    """A page of live vacancies. Relevance order when searching text, newest first otherwise."""
    statement, count = search_statements(db, f)
    total = db.scalar(count) or 0
    rows = db.execute(statement.limit(page_size).offset((page - 1) * page_size)).all()
    return cards_from_rows(db, rows), total


def cards_from_rows(
    db: Session, rows: Sequence[tuple[Vacancy, str, str | None]]
) -> list[VacancyCard]:
    """Public cards for (vacancy, company name, district name) rows. Shared with saved jobs."""
    with_logo = logo_owner_ids(db, [row[0].id for row in rows])
    cards: list[VacancyCard] = []
    for vacancy, company_name, district_name in rows:
        salary_min, salary_max = _salary(vacancy)
        assert vacancy.employment_type and vacancy.work_arrangement  # published => complete
        assert vacancy.published_at and vacancy.expires_at
        cards.append(
            VacancyCard(
                id=vacancy.id,
                title=vacancy.title,
                company_name=company_name,
                company_logo_url=logo_url(vacancy.id) if vacancy.id in with_logo else None,
                district_id=vacancy.district_id,
                district_name=district_name,
                employment_type=vacancy.employment_type,
                work_arrangement=vacancy.work_arrangement,
                published_at=vacancy.published_at,
                expires_at=vacancy.expires_at,
                salary_min=salary_min,
                salary_max=salary_max,
            )
        )
    return cards


def get_detail(db: Session, vacancy_id: uuid.UUID) -> VacancyDetail:
    """One live vacancy with its requirements and the company's public details."""
    row = db.execute(
        select(Vacancy, Employer.company_name, District.name)
        .join(Employer, Employer.id == Vacancy.employer_id)
        .outerjoin(District, District.id == Vacancy.district_id)
        .where(Vacancy.id == vacancy_id, live_clause())
    ).first()
    if row is None:
        raise _not_found()
    vacancy, company_name, district_name = row
    assert vacancy.employment_type and vacancy.work_arrangement and vacancy.description
    assert vacancy.published_at and vacancy.expires_at

    level_name = None
    if vacancy.min_qualification_level_id is not None:
        level = db.get(QualificationLevel, vacancy.min_qualification_level_id)
        level_name = level.name if level else None
    employer_district = db.scalar(
        select(District.name)
        .join(Employer, Employer.district_id == District.id)
        .where(Employer.id == vacancy.employer_id)
    )
    requirements: list[VacancyRequirement] = requirements_of(db, vacancy)
    salary_min, salary_max = _salary(vacancy)
    return VacancyDetail(
        id=vacancy.id,
        title=vacancy.title,
        description=vacancy.description,
        employment_type=vacancy.employment_type,
        work_arrangement=vacancy.work_arrangement,
        district_id=vacancy.district_id,
        district_name=district_name,
        min_qualification_level_id=vacancy.min_qualification_level_id,
        min_qualification_level_name=level_name,
        min_experience_years=vacancy.min_experience_years,
        salary_min=salary_min,
        salary_max=salary_max,
        application_method=vacancy.application_method,
        external_url=vacancy.external_url,
        published_at=vacancy.published_at,
        expires_at=vacancy.expires_at,
        requirements=[RequirementOut.from_requirement(item) for item in requirements],
        employer=PublicEmployer(
            company_name=company_name,
            district_name=employer_district,
            logo_url=logo_url(vacancy.id) if logo_owner_ids(db, [vacancy.id]) else None,
        ),
    )

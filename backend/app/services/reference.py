"""Reading reference data. Public lists; nothing here is private."""

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import District, FieldOfStudy, Institution, QualificationLevel, Skill

SKILL_SEARCH_LIMIT = 20
SKILL_QUERY_MAX_LENGTH = 50


def normalise_name(value: str) -> str:
    """Lowercase with single spaces: how skills are matched and kept unique."""
    return " ".join(value.lower().split())


def list_districts(db: Session) -> list[District]:
    return list(db.scalars(select(District).order_by(func.lower(District.name), District.name)))


def list_qualification_levels(db: Session) -> list[QualificationLevel]:
    return list(db.scalars(select(QualificationLevel).order_by(QualificationLevel.rank)))


def list_institutions(db: Session) -> list[Institution]:
    return list(
        db.scalars(
            select(Institution)
            .where(Institution.is_active.is_(True))
            .order_by(func.lower(Institution.name), Institution.name)
        )
    )


def list_fields_of_study(db: Session) -> list[FieldOfStudy]:
    return list(
        db.scalars(
            select(FieldOfStudy)
            .where(FieldOfStudy.is_active.is_(True))
            .order_by(func.lower(FieldOfStudy.name), FieldOfStudy.name)
        )
    )


def search_skills(db: Session, query: str | None, limit: int = SKILL_SEARCH_LIMIT) -> list[Skill]:
    """Active skills whose name contains `query` (any case), names starting with it first.

    No query: the first skills alphabetically. At most `limit` (never more than 20). Characters
    such as % and _ are matched literally, not as wildcards.
    """
    limit = min(limit, SKILL_SEARCH_LIMIT)
    statement = select(Skill).where(Skill.is_active.is_(True))
    needle = normalise_name(query) if query else ""
    if needle:
        statement = statement.where(
            Skill.name_normalized.contains(needle, autoescape=True)
        ).order_by(
            case((Skill.name_normalized.startswith(needle, autoescape=True), 0), else_=1),
            Skill.name_normalized,
        )
    else:
        statement = statement.order_by(Skill.name_normalized)
    return list(db.scalars(statement.limit(limit)))

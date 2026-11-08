"""Vacancies.

Rules in one place:
- Only the owning employer (or an admin) can see, edit or close a vacancy; anyone else gets 404.
- Publishing needs an approved company (the route uses the PublishingEmployer dependency), a
  complete vacancy, and an expiry in the future and at most 90 days after publishing.
- A published vacancy keeps its identity (title, type, arrangement, district, how to apply) but its
  description, requirements, salary, minimum level and expiry can still change.
- Closed is final. "Expired" is never stored: live means published and expires_at > now.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import ColumnElement, and_, func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    Application,
    ApplicationMethod,
    ApplicationStatus,
    District,
    Employer,
    QualificationLevel,
    RequirementKind,
    Skill,
    User,
    UserRole,
    Vacancy,
    VacancyRequirement,
    VacancyStatus,
    WorkArrangement,
)
from app.schemas.vacancy import MAX_REQUIREMENTS, RequirementIn, VacancyIn
from app.services import employers as employer_service
from app.services.audit import record_event

MAX_LIFETIME = timedelta(days=90)

# Changing these on a published vacancy would change which job it is, or how people apply for it.
LOCKED_WHEN_PUBLISHED = (
    "title",
    "employment_type",
    "work_arrangement",
    "district_id",
    "application_method",
    "external_url",
)

_COLUMNS = (
    "title",
    "description",
    "employment_type",
    "work_arrangement",
    "district_id",
    "min_qualification_level_id",
    "min_experience_years",
    "salary_min",
    "salary_max",
    "show_salary",
    "application_method",
    "external_url",
    "expires_at",
)


@dataclass(frozen=True)
class VacancyView:
    vacancy: Vacancy
    requirements: list[VacancyRequirement]
    is_live: bool
    # Applications received, and how many of them nobody has looked at yet (status submitted).
    application_count: int = 0
    new_application_count: int = 0


# ---------- the live predicate ----------


def live_clause(now: datetime | None = None) -> ColumnElement[bool]:
    """SQL for "published and not expired". Everything public uses this one predicate."""
    moment = now or func.now()
    return and_(Vacancy.status == VacancyStatus.PUBLISHED, Vacancy.expires_at > moment)


def is_live(vacancy: Vacancy, now: datetime | None = None) -> bool:
    moment = now or datetime.now(UTC)
    return (
        vacancy.status == VacancyStatus.PUBLISHED
        and vacancy.expires_at is not None
        and vacancy.expires_at > moment
    )


# ---------- errors ----------


def _validation(fields: dict[str, str]) -> AppError:
    return AppError(
        "validation_error", "Some fields are invalid.", status=422, details={"fields": fields}
    )


def _not_found() -> AppError:
    return AppError("vacancy_not_found", "This vacancy does not exist.", status=404)


def _closed() -> AppError:
    return AppError("vacancy_closed", "This vacancy is closed and cannot be changed.", status=409)


# ---------- finding vacancies ----------


def get_for_actor(
    db: Session, vacancy_id: uuid.UUID, actor: User, *, lock: bool = False
) -> Vacancy:
    """An admin can reach any vacancy, an employer only their own. Anyone else: 404."""
    statement = select(Vacancy).where(Vacancy.id == vacancy_id)
    if actor.role == UserRole.EMPLOYER:
        statement = statement.join(Employer, Employer.id == Vacancy.employer_id).where(
            Employer.owner_user_id == actor.id
        )
    elif actor.role != UserRole.ADMIN:
        raise _not_found()
    if lock:
        statement = statement.with_for_update(of=Vacancy)
    vacancy = db.scalar(statement)
    if vacancy is None:
        raise _not_found()
    return vacancy


def requirements_of(db: Session, vacancy: Vacancy) -> list[VacancyRequirement]:
    return list(
        db.scalars(
            select(VacancyRequirement)
            .where(VacancyRequirement.vacancy_id == vacancy.id)
            .order_by(
                VacancyRequirement.is_mandatory.desc(),
                VacancyRequirement.kind,
                VacancyRequirement.label,
                VacancyRequirement.id,
            )
        )
    )


def view(db: Session, vacancy: Vacancy) -> VacancyView:
    total, new = db.execute(
        select(
            func.count(),
            func.count().filter(Application.status == ApplicationStatus.SUBMITTED),
        ).where(Application.vacancy_id == vacancy.id)
    ).one()
    return VacancyView(vacancy, requirements_of(db, vacancy), is_live(vacancy), total, new)


def list_for_employer(
    db: Session,
    employer: Employer,
    *,
    status: VacancyStatus | None,
    page: int,
    page_size: int,
) -> tuple[list[VacancyView], int]:
    filters: list[Any] = [Vacancy.employer_id == employer.id]
    if status is not None:
        filters.append(Vacancy.status == status)
    total = db.scalar(select(func.count()).select_from(Vacancy).where(*filters)) or 0
    rows = db.scalars(
        select(Vacancy)
        .where(*filters)
        .order_by(Vacancy.updated_at.desc(), Vacancy.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    return [view(db, vacancy) for vacancy in rows], total


# ---------- checking the content ----------


def _check_content(db: Session, data: VacancyIn) -> dict[str, str]:
    """Rules every save must meet, draft or not. Returns field -> message."""
    errors: dict[str, str] = {}
    if (
        data.salary_min is not None
        and data.salary_max is not None
        and data.salary_max < data.salary_min
    ):
        errors["salary_max"] = "The highest salary cannot be lower than the lowest."
    if data.application_method == ApplicationMethod.INTERNAL and data.external_url:
        errors["external_url"] = "Remove the link: people apply on this site."
    if data.district_id is not None and db.get(District, data.district_id) is None:
        errors["district_id"] = "Choose a district from the list."
    if (
        data.min_qualification_level_id is not None
        and db.get(QualificationLevel, data.min_qualification_level_id) is None
    ):
        errors["min_qualification_level_id"] = "Choose a qualification level from the list."
    return errors


def _resolve_requirements(
    db: Session, items: list[RequirementIn]
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """The rows to store, with skill names filled in, and any field errors."""
    errors: dict[str, str] = {}
    if len(items) > MAX_REQUIREMENTS:
        errors["requirements"] = f"Add at most {MAX_REQUIREMENTS} requirements."
        return [], errors
    skill_ids = {item.skill_id for item in items if item.skill_id is not None}
    names = {
        skill.id: skill.name for skill in db.scalars(select(Skill).where(Skill.id.in_(skill_ids)))
    }
    rows: list[dict[str, Any]] = []
    seen_skills: set[uuid.UUID] = set()
    for index, item in enumerate(items):
        key = f"requirements.{index}"
        if item.kind == RequirementKind.SKILL:
            if item.skill_id is None:
                errors[f"{key}.skill_id"] = "Choose a skill from the list."
            elif item.skill_id not in names:
                errors[f"{key}.skill_id"] = "Choose a skill from the list."
            elif item.skill_id in seen_skills:
                errors[f"{key}.skill_id"] = "This skill is already listed."
            else:
                seen_skills.add(item.skill_id)
                rows.append(
                    {
                        "kind": item.kind,
                        "skill_id": item.skill_id,
                        "label": names[item.skill_id],
                        "is_mandatory": item.is_mandatory,
                    }
                )
        else:
            if item.skill_id is not None:
                errors[f"{key}.skill_id"] = "Only skill requirements have a skill."
            elif not item.label:
                errors[f"{key}.label"] = "Describe the requirement."
            else:
                rows.append(
                    {
                        "kind": item.kind,
                        "skill_id": None,
                        "label": item.label,
                        "is_mandatory": item.is_mandatory,
                    }
                )
    return rows, errors


def _check_publishable(data: VacancyIn, *, published_at: datetime, now: datetime) -> dict[str, str]:
    """What a live vacancy must have. Used when publishing and when editing a published one."""
    errors: dict[str, str] = {}
    if not data.description:
        errors["description"] = "Describe the job."
    if data.employment_type is None:
        errors["employment_type"] = "Choose the type of job."
    if data.work_arrangement is None:
        errors["work_arrangement"] = "Choose where the work is done."
    if data.work_arrangement != WorkArrangement.REMOTE and data.district_id is None:
        errors["district_id"] = "Choose a district (only remote jobs can leave it out)."
    if data.application_method == ApplicationMethod.EXTERNAL and not data.external_url:
        errors["external_url"] = "Give the https:// link where people apply."
    if data.expires_at is None:
        errors["expires_at"] = "Choose when applications close."
    elif data.expires_at <= now:
        errors["expires_at"] = "Choose a closing date in the future."
    elif data.expires_at > published_at + MAX_LIFETIME:
        errors["expires_at"] = "A vacancy can stay open for at most 90 days from publishing."
    return errors


def _store_requirements(db: Session, vacancy: Vacancy, rows: list[dict[str, Any]]) -> None:
    for existing in requirements_of(db, vacancy):
        db.delete(existing)
    db.flush()
    for row in rows:
        db.add(VacancyRequirement(vacancy_id=vacancy.id, **row))
    db.flush()


def _as_input(vacancy: Vacancy) -> dict[str, Any]:
    return {name: getattr(vacancy, name) for name in _COLUMNS}


# ---------- create, update ----------


def create_draft(
    db: Session, employer: Employer, data: VacancyIn, *, created_by_admin: bool = False
) -> Vacancy:
    errors = _check_content(db, data)
    rows, requirement_errors = _resolve_requirements(db, data.requirements)
    errors.update(requirement_errors)
    if errors:
        raise _validation(errors)
    vacancy = Vacancy(
        employer_id=employer.id,
        created_by_admin=created_by_admin,
        **{name: getattr(data, name) for name in _COLUMNS},
    )
    db.add(vacancy)
    db.flush()
    _store_requirements(db, vacancy, rows)
    return vacancy


def update(
    db: Session, vacancy: Vacancy, data: VacancyIn, *, now: datetime | None = None
) -> Vacancy:
    """Replace the vacancy's editable fields and requirements."""
    now = now or datetime.now(UTC)
    if vacancy.status == VacancyStatus.CLOSED:
        raise _closed()
    errors = _check_content(db, data)
    rows, requirement_errors = _resolve_requirements(db, data.requirements)
    errors.update(requirement_errors)

    if vacancy.status == VacancyStatus.PUBLISHED:
        locked = {
            name: "Cannot be changed after publishing."
            for name in LOCKED_WHEN_PUBLISHED
            if getattr(data, name) != getattr(vacancy, name)
        }
        if locked:
            raise AppError(
                "field_locked",
                "Some fields cannot be changed once a vacancy is published.",
                status=422,
                details={"fields": locked},
            )
        assert vacancy.published_at is not None
        errors.update(_check_publishable(data, published_at=vacancy.published_at, now=now))

    if errors:
        raise _validation(errors)
    for name in _COLUMNS:
        setattr(vacancy, name, getattr(data, name))
    db.flush()
    _store_requirements(db, vacancy, rows)
    return vacancy


# ---------- publish, close ----------


def publish(
    db: Session,
    vacancy: Vacancy,
    actor: User,
    *,
    ip: str | None = None,
    now: datetime | None = None,
) -> Vacancy:
    """Draft to published. The caller has already checked the employer is approved."""
    now = now or datetime.now(UTC)
    if vacancy.status == VacancyStatus.CLOSED:
        raise _closed()
    if vacancy.status == VacancyStatus.PUBLISHED:
        raise AppError(
            "invalid_vacancy_transition", "This vacancy is already published.", status=409
        )
    current = VacancyIn.model_construct(**_as_input(vacancy), requirements=[])
    if errors := _check_publishable(current, published_at=now, now=now):
        raise AppError(
            "vacancy_incomplete",
            "Complete the vacancy before publishing it.",
            status=422,
            details={"fields": errors},
        )
    vacancy.status = VacancyStatus.PUBLISHED
    vacancy.published_at = now
    record_event(
        db,
        "vacancy_published",
        actor_user_id=actor.id,
        entity_type="vacancy",
        entity_id=vacancy.id,
        ip=ip,
    )
    db.flush()
    return vacancy


def close(db: Session, vacancy: Vacancy, actor: User, *, ip: str | None = None) -> Vacancy:
    """Final: a closed vacancy cannot be reopened or edited. A draft can be closed to discard it."""
    if vacancy.status == VacancyStatus.CLOSED:
        raise _closed()
    vacancy.status = VacancyStatus.CLOSED
    record_event(
        db,
        "vacancy_closed",
        actor_user_id=actor.id,
        entity_type="vacancy",
        entity_id=vacancy.id,
        ip=ip,
    )
    db.flush()
    return vacancy


# ---------- admin on behalf of a partner ----------


def partner_employer(db: Session, employer_id: uuid.UUID) -> Employer:
    employer = db.get(Employer, employer_id)
    if employer is None:
        raise AppError("employer_not_found", "This employer does not exist.", status=404)
    if not employer_service.can_publish(employer):
        raise AppError(
            "employer_not_verified",
            "A vacancy can only be created for an approved employer.",
            status=409,
        )
    return employer

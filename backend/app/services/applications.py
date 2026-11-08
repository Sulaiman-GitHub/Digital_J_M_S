"""Applications.

Rules in one place:
- A verified job seeker with a profile, a CV and the CV-sharing consent can apply once to a live
  vacancy that takes applications here. Applying copies the CV file and the profile, so later
  changes to either never change what the employer sees.
- Only the vacancy's approved employer can move an application forward, and only along the table
  below. Only the applicant can withdraw. Rejected and withdrawn are final.
- Every status change writes a history row. Anyone who is not the applicant or the vacancy's
  employer gets 404, as if the application did not exist.
"""

import contextlib
import uuid
from dataclasses import dataclass
from enum import StrEnum

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.logging import get_logger
from app.integrations.storage import FileNotFoundInStorage, FileStorage, StorageError, new_key
from app.models import (
    Application,
    ApplicationMethod,
    ApplicationStatus,
    ApplicationStatusEvent,
    ConsentType,
    District,
    Employer,
    FieldOfStudy,
    Institution,
    QualificationLevel,
    User,
    UserRole,
    Vacancy,
)
from app.schemas.application import ApplyIn
from app.services import consents as consent_service
from app.services import cvs as cv_service
from app.services import employers as employer_service
from app.services import images as image_service
from app.services import profiles as profile_service
from app.services.audit import record_event
from app.services.vacancies import live_clause

logger = get_logger("applications")
S = ApplicationStatus

# ---------- the transition table, a pure function of two statuses ----------

EMPLOYER_TRANSITIONS: dict[S, frozenset[S]] = {
    S.SUBMITTED: frozenset({S.UNDER_REVIEW, S.REJECTED}),
    S.UNDER_REVIEW: frozenset({S.SHORTLISTED, S.REJECTED}),
    S.SHORTLISTED: frozenset({S.INTERVIEW, S.REJECTED}),
    S.INTERVIEW: frozenset({S.OFFERED, S.REJECTED}),
    S.OFFERED: frozenset({S.REJECTED}),
    S.REJECTED: frozenset(),
    S.WITHDRAWN: frozenset(),
}
FINAL = frozenset({S.REJECTED, S.WITHDRAWN})
APPLICANT_TRANSITIONS: dict[S, frozenset[S]] = {
    status: (frozenset() if status in FINAL else frozenset({S.WITHDRAWN})) for status in S
}


class Actor(StrEnum):
    APPLICANT = "applicant"
    EMPLOYER = "employer"


def allowed_next(status: S, actor: Actor) -> frozenset[S]:
    table = EMPLOYER_TRANSITIONS if actor is Actor.EMPLOYER else APPLICANT_TRANSITIONS
    return table[status]


def can_move(from_status: S, to_status: S, actor: Actor) -> bool:
    return to_status in allowed_next(from_status, actor)


def _invalid_transition(from_status: S, to_status: S) -> AppError:
    return AppError(
        "invalid_status_transition",
        f"An application cannot move from {from_status.value} to {to_status.value}.",
        status=409,
    )


# ---------- errors ----------


def _vacancy_not_found() -> AppError:
    return AppError("vacancy_not_found", "This vacancy does not exist.", status=404)


def _application_not_found() -> AppError:
    return AppError("application_not_found", "This application does not exist.", status=404)


def _already_applied() -> AppError:
    return AppError("already_applied", "You have already applied for this vacancy.", status=409)


DELETED_EMAIL_SUFFIX = "@deleted.invalid"


def _visible_email(email: str) -> str:
    """A deleted account's placeholder address is never shown (see services/account.py)."""
    return "" if email.endswith(DELETED_EMAIL_SUFFIX) else email


# ---------- what the caller can see ----------


@dataclass(frozen=True)
class ApplicationView:
    application: Application
    vacancy: Vacancy
    company_name: str
    applicant_email: str
    history: list[ApplicationStatusEvent]
    actor: Actor


def _history(db: Session, application: Application) -> list[ApplicationStatusEvent]:
    return list(
        db.scalars(
            select(ApplicationStatusEvent)
            .where(ApplicationStatusEvent.application_id == application.id)
            .order_by(ApplicationStatusEvent.created_at, ApplicationStatusEvent.id)
        )
    )


def _load(db: Session, application_id: uuid.UUID, user: User, *, lock: bool = False):
    """The application, its vacancy and company, and who the caller is to it. 404 for anyone
    else, including an employer who is not approved (they cannot read applicants)."""
    statement = (
        select(Application, Vacancy, Employer)
        .join(Vacancy, Vacancy.id == Application.vacancy_id)
        .join(Employer, Employer.id == Vacancy.employer_id)
        .where(Application.id == application_id)
    )
    if lock:
        statement = statement.with_for_update(of=Application)
    row = db.execute(statement).first()
    if row is None:
        raise _application_not_found()
    application, vacancy, employer = row
    if application.applicant_user_id == user.id and user.role == UserRole.JOB_SEEKER:
        return application, vacancy, employer, Actor.APPLICANT
    if employer.owner_user_id == user.id and user.role == UserRole.EMPLOYER:
        if not employer_service.can_publish(employer):
            raise AppError(
                "employer_not_verified",
                "Your company must be verified before you can review applications.",
                status=403,
            )
        return application, vacancy, employer, Actor.EMPLOYER
    raise _application_not_found()


def _view(db: Session, application, vacancy, employer, actor: Actor) -> ApplicationView:
    email = _visible_email(
        db.scalar(select(User.email).where(User.id == application.applicant_user_id)) or ""
    )
    return ApplicationView(
        application, vacancy, employer.company_name, email, _history(db, application), actor
    )


def get_application(db: Session, user: User, application_id: uuid.UUID) -> ApplicationView:
    application, vacancy, employer, actor = _load(db, application_id, user)
    return _view(db, application, vacancy, employer, actor)


def list_mine(
    db: Session, user: User, *, page: int, page_size: int, vacancy_id: uuid.UUID | None = None
) -> tuple[list[tuple[Application, Vacancy, str]], int]:
    """The caller's own applications, newest first. `vacancy_id` narrows it to one vacancy (the
    vacancy page uses this to show "Applied")."""
    where = [Application.applicant_user_id == user.id]
    if vacancy_id is not None:
        where.append(Application.vacancy_id == vacancy_id)
    total = db.scalar(select(func.count()).select_from(Application).where(*where)) or 0
    rows = db.execute(
        select(Application, Vacancy, Employer.company_name)
        .join(Vacancy, Vacancy.id == Application.vacancy_id)
        .join(Employer, Employer.id == Vacancy.employer_id)
        .where(*where)
        .order_by(Application.submitted_at.desc(), Application.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    return [(a, v, name) for a, v, name in rows], total


def list_for_vacancy(
    db: Session,
    employer: Employer,
    vacancy_id: uuid.UUID,
    *,
    status: S | None,
    page: int,
    page_size: int,
) -> tuple[list[tuple[Application, str]], int]:
    """Applicants for one of the employer's own vacancies, newest first. Anyone else's: 404."""
    owned = db.scalar(
        select(Vacancy.id).where(Vacancy.id == vacancy_id, Vacancy.employer_id == employer.id)
    )
    if owned is None:
        raise _vacancy_not_found()
    where = [Application.vacancy_id == vacancy_id]
    if status is not None:
        where.append(Application.status == status)
    total = db.scalar(select(func.count()).select_from(Application).where(*where)) or 0
    rows = db.execute(
        select(Application, User.email)
        .join(User, User.id == Application.applicant_user_id)
        .where(*where)
        .order_by(Application.submitted_at.desc(), Application.id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    return [(a, _visible_email(email)) for a, email in rows], total


def counts_by_status(db: Session, vacancy_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, int]]:
    """For the employer's vacancy list: how many applications each vacancy has, by status."""
    if not vacancy_ids:
        return {}
    rows = db.execute(
        select(Application.vacancy_id, Application.status, func.count())
        .where(Application.vacancy_id.in_(vacancy_ids))
        .group_by(Application.vacancy_id, Application.status)
    ).all()
    result: dict[uuid.UUID, dict[str, int]] = {}
    for vacancy_id, status, count in rows:
        result.setdefault(vacancy_id, {})[status.value] = count
    return result


def has_applications(db: Session, vacancy_id: uuid.UUID) -> bool:
    return (
        db.scalar(select(Application.id).where(Application.vacancy_id == vacancy_id).limit(1))
        is not None
    )


# ---------- applying ----------


def _lookup(db: Session, model, ident: uuid.UUID | None) -> str | None:
    if ident is None:
        return None
    return db.scalar(select(model.name).where(model.id == ident))


def _snapshot(db: Session, user: User) -> dict:
    """The profile as the employer will see it, with names instead of ids."""
    try:
        view = profile_service.get_my_profile(db, user)
    except AppError:
        raise AppError(
            "profile_required", "Complete your profile before you apply.", status=409
        ) from None
    profile = view.profile
    return {
        "full_name": profile.full_name,
        "phone": profile.phone,
        "institution": _lookup(db, Institution, profile.institution_id)
        or profile.institution_other_name,
        "qualification": _lookup(db, QualificationLevel, profile.qualification_level_id),
        "field_of_study": _lookup(db, FieldOfStudy, profile.field_of_study_id)
        or profile.field_of_study_other,
        "study_status": profile.study_status.value,
        "expected_completion_date": (
            profile.expected_completion_date.isoformat()
            if profile.expected_completion_date
            else None
        ),
        "graduation_date": (
            profile.graduation_date.isoformat() if profile.graduation_date else None
        ),
        "district": _lookup(db, District, profile.district_id),
        "summary": profile.summary,
        "skills": [skill.name for skill in view.skills],
        "experiences": [
            {
                "title": item.title,
                "organisation": item.organisation,
                "start_date": item.start_date.isoformat(),
                "end_date": item.end_date.isoformat() if item.end_date else None,
                "description": item.description,
            }
            for item in view.experiences
        ],
    }


def _copy_cv(storage: FileStorage, source_key: str) -> tuple[str, int]:
    """Copy the CV file under a new random key so replacing or deleting the CV cannot affect it."""
    key = new_key()
    try:
        with storage.open(source_key) as source:
            written = storage.save(key, source)
    except FileNotFoundInStorage:
        logger.error("A CV row points at a file that is missing from storage")
        raise AppError(
            "cv_file_missing",
            "We could not find your CV file. Please upload it again.",
            status=404,
        ) from None
    except StorageError:
        logger.exception("Could not copy a CV file for an application")
        _remove_quietly(storage, key)
        raise AppError(
            "storage_unavailable", "We could not save your application. Please try again.", 503
        ) from None
    return key, written


def _remove_quietly(storage: FileStorage, key: str) -> None:
    with contextlib.suppress(StorageError):
        storage.delete(key)


def _add_event(
    db: Session,
    application: Application,
    from_status: S | None,
    to_status: S,
    actor: User,
    note: str | None,
) -> None:
    db.add(
        ApplicationStatusEvent(
            application_id=application.id,
            from_status=from_status,
            to_status=to_status,
            actor_user_id=actor.id,
            note=note,
        )
    )


def submit(
    db: Session,
    storage: FileStorage,
    user: User,
    vacancy_id: uuid.UUID,
    data: ApplyIn,
    *,
    ip: str | None = None,
) -> Application:
    """Apply to a vacancy as the caller. The route has already checked role and verified email."""
    vacancy = db.scalar(select(Vacancy).where(Vacancy.id == vacancy_id, live_clause()))
    if vacancy is None:
        raise _vacancy_not_found()
    if vacancy.application_method != ApplicationMethod.INTERNAL:
        raise AppError(
            "external_application",
            "This vacancy takes applications on another website. "
            "Applying there is not tracked here.",
            status=400,
        )
    existing = db.scalar(
        select(Application.id).where(
            Application.vacancy_id == vacancy.id, Application.applicant_user_id == user.id
        )
    )
    if existing is not None:
        raise _already_applied()
    snapshot = _snapshot(db, user)
    cv = cv_service.get_active_cv(db, user)
    if cv is None:
        raise AppError("cv_required", "Upload your CV before you apply.", status=409)
    if not consent_service.has_active(db, user, ConsentType.CV_SHARING_WITH_EMPLOYERS):
        raise AppError(
            "consent_required",
            "Agree to share your CV with employers before you apply.",
            status=409,
        )

    key, size = _copy_cv(storage, cv.storage_key)
    application = Application(
        vacancy_id=vacancy.id,
        applicant_user_id=user.id,
        cover_note=data.cover_note,
        cv_storage_key=key,
        cv_original_filename=cv.original_filename,
        cv_content_type=cv.content_type,
        cv_size_bytes=size,
        profile_snapshot=snapshot,
    )
    try:
        with db.begin_nested():  # two clicks at once: the unique constraint decides
            db.add(application)
            db.flush()
    except IntegrityError:
        _remove_quietly(storage, key)
        raise _already_applied() from None
    except BaseException:
        _remove_quietly(storage, key)
        raise
    _add_event(db, application, None, S.SUBMITTED, user, None)
    record_event(
        db,
        "application_submitted",
        actor_user_id=user.id,
        entity_type="application",
        entity_id=application.id,
        metadata={"vacancy_id": str(vacancy.id)},
        ip=ip,
    )
    db.flush()
    return application


# ---------- changing the status ----------


def _move(
    db: Session,
    application: Application,
    to_status: S,
    actor: Actor,
    user: User,
    note: str | None,
    *,
    ip: str | None,
) -> None:
    if not can_move(application.status, to_status, actor):
        raise _invalid_transition(application.status, to_status)
    from_status = application.status
    application.status = to_status
    db.flush()
    _add_event(db, application, from_status, to_status, user, note)
    record_event(
        db,
        "application_status_changed",
        actor_user_id=user.id,
        entity_type="application",
        entity_id=application.id,
        metadata={"from": from_status.value, "to": to_status.value, "by": actor.value},
        ip=ip,
    )
    db.flush()


def employer_update_status(
    db: Session,
    user: User,
    application_id: uuid.UUID,
    new_status: S,
    note: str | None,
    *,
    ip: str | None = None,
) -> ApplicationView:
    application, vacancy, employer, actor = _load(db, application_id, user, lock=True)
    if actor is not Actor.EMPLOYER:
        raise _application_not_found()  # an applicant cannot set employer statuses
    _move(db, application, new_status, Actor.EMPLOYER, user, note, ip=ip)
    return _view(db, application, vacancy, employer, actor)


def withdraw(
    db: Session, user: User, application_id: uuid.UUID, *, ip: str | None = None
) -> ApplicationView:
    application, vacancy, employer, actor = _load(db, application_id, user, lock=True)
    if actor is not Actor.APPLICANT:
        raise _application_not_found()  # only the applicant can withdraw
    _move(db, application, S.WITHDRAWN, Actor.APPLICANT, user, None, ip=ip)
    return _view(db, application, vacancy, employer, actor)


# ---------- the CV the employer is shown ----------


def applicant_photo(db: Session, user: User, application_id: uuid.UUID):
    """The photo of the person behind an application, for the vacancy's own employer only (a
    photo is shared with the companies the person applied to, nothing wider). 404 for anyone
    else, for a deleted applicant, and when there is no photo."""
    application, _vacancy, _employer, actor = _load(db, application_id, user)
    if actor is not Actor.EMPLOYER or application.profile_snapshot.get("deleted"):
        raise _application_not_found()
    return image_service.photo_of_user(db, application.applicant_user_id)


def open_snapshot_cv(
    db: Session, storage: FileStorage, user: User, application_id: uuid.UUID, *, ip: str | None
):
    """The application's own copy of the CV, for its vacancy's approved employer only. Writes an
    audit event for every download."""
    application, _vacancy, _employer, actor = _load(db, application_id, user)
    if actor is not Actor.EMPLOYER:
        raise _application_not_found()
    if application.profile_snapshot.get("deleted"):
        raise AppError("applicant_deleted", "This applicant deleted their account.", status=404)
    stream = cv_service.open_stored_file(storage, application.cv_storage_key)
    record_event(
        db,
        "application_cv_downloaded",
        actor_user_id=user.id,
        entity_type="application",
        entity_id=application.id,
        ip=ip,
    )
    db.flush()
    return application, stream

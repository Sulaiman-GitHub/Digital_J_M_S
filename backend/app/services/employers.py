"""Employer profiles and their verification state machine.

An employer is found only through the caller's own user id (no employer id in the employer's
URLs). The status changes only through `change_status`, which consults the transition table
below, writes a history row and an audit event.
"""

from datetime import UTC, datetime

from pydantic_core import PydanticCustomError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    District,
    Employer,
    EmployerVerificationEvent,
    User,
    UserRole,
    VerificationStatus,
)
from app.schemas.employer import EmployerIn
from app.schemas.profile import clean_block
from app.services.audit import record_event

S = VerificationStatus

# (from, to) -> the role allowed to make the change. Anything not listed is refused.
TRANSITIONS: dict[tuple[S, S], UserRole] = {
    (S.DRAFT, S.PENDING): UserRole.EMPLOYER,  # submit
    (S.REJECTED, S.PENDING): UserRole.EMPLOYER,  # resubmit after edits
    (S.APPROVED, S.PENDING): UserRole.EMPLOYER,  # edited a key field: needs a new review
    (S.PENDING, S.APPROVED): UserRole.ADMIN,
    (S.PENDING, S.REJECTED): UserRole.ADMIN,
    (S.APPROVED, S.SUSPENDED): UserRole.ADMIN,
    (S.SUSPENDED, S.APPROVED): UserRole.ADMIN,
}
REASON_REQUIRED = frozenset({S.REJECTED, S.SUSPENDED})
REASON_MAX = 1000

# Statuses the employer can submit from (not the edit-triggered approved -> pending).
SUBMITTABLE = frozenset({S.DRAFT, S.REJECTED})
# While a review is under way, or after suspension, the profile is read-only for the employer.
LOCKED = frozenset({S.PENDING, S.SUSPENDED})
# Editing these on an approved profile sends it back for review.
KEY_FIELDS = ("company_name", "registration_number")

_PROFILE_COLUMNS = (
    "company_name",
    "registration_number",
    "website",
    "contact_phone",
    "district_id",
    "description",
)


def transition_allowed(from_status: S, to_status: S, actor_role: UserRole) -> bool:
    """Pure: may someone with this role move an employer from one status to another?"""
    return TRANSITIONS.get((from_status, to_status)) == actor_role


def can_publish(employer: Employer) -> bool:
    """Only an approved employer may publish vacancies. Reused by the vacancy module."""
    return employer.verification_status == S.APPROVED


def _invalid_transition(from_status: S, to_status: S) -> AppError:
    return AppError(
        "invalid_verification_transition",
        f"An employer cannot move from {from_status.value} to {to_status.value}.",
        status=409,
    )


def change_status(
    db: Session,
    employer: Employer,
    to_status: S,
    *,
    actor: User,
    reason: str | None = None,
    ip: str | None = None,
) -> EmployerVerificationEvent:
    """Move the employer to a new status, if the table allows this actor to. Writes the history
    row and the audit event. Rejecting and suspending need a reason."""
    from_status = employer.verification_status
    if not transition_allowed(from_status, to_status, actor.role):
        raise _invalid_transition(from_status, to_status)
    try:
        cleaned = clean_block(reason, REASON_MAX, "The reason")
    except PydanticCustomError as problem:
        raise AppError(
            "validation_error",
            "Some fields are invalid.",
            status=422,
            details={"fields": {"reason": problem.message()}},
        ) from None
    if to_status in REASON_REQUIRED and not cleaned:
        raise AppError(
            "reason_required",
            "Give a reason. The employer will see it.",
            status=422,
            details={"fields": {"reason": "Give a reason."}},
        )

    now = datetime.now(UTC)
    employer.verification_status = to_status
    if to_status == S.PENDING:
        employer.submitted_at = now
        employer.decided_at = None
    else:
        employer.decided_at = now
    event = EmployerVerificationEvent(
        employer_id=employer.id,
        from_status=from_status,
        to_status=to_status,
        actor_user_id=actor.id,
        reason=cleaned,
    )
    db.add(event)
    record_event(
        db,
        f"employer_{to_status.value}",
        actor_user_id=actor.id,
        entity_type="employer",
        entity_id=employer.id,
        metadata={"from": from_status.value, "to": to_status.value, "reason": cleaned},
        ip=ip,
    )
    db.flush()
    return event


def status_reason(db: Session, employer: Employer) -> str | None:
    """The reason given for the current rejection or suspension (None in any other status)."""
    if employer.verification_status not in REASON_REQUIRED:
        return None
    return db.scalar(
        select(EmployerVerificationEvent.reason)
        .where(
            EmployerVerificationEvent.employer_id == employer.id,
            EmployerVerificationEvent.to_status == employer.verification_status,
        )
        .order_by(EmployerVerificationEvent.created_at.desc())
        .limit(1)
    )


def get_employer_for_user(db: Session, user: User) -> Employer | None:
    return db.scalar(select(Employer).where(Employer.owner_user_id == user.id))


def get_my_employer(db: Session, user: User) -> Employer:
    employer = get_employer_for_user(db, user)
    if employer is None:
        raise AppError(
            "employer_not_found", "You have not created your company profile yet.", status=404
        )
    return employer


def _values(data: EmployerIn) -> dict[str, object]:
    return {name: getattr(data, name) for name in _PROFILE_COLUMNS}


def upsert_my_employer(
    db: Session, user: User, data: EmployerIn, *, ip: str | None = None
) -> Employer:
    """Create the company profile (as a draft) or replace its fields."""
    if db.get(District, data.district_id) is None:
        raise AppError(
            "validation_error",
            "Some fields are invalid.",
            status=422,
            details={"fields": {"district_id": "Choose a district from the list."}},
        )
    values = _values(data)
    employer = get_employer_for_user(db, user)
    if employer is None:
        employer = Employer(owner_user_id=user.id, **values)
        db.add(employer)
        db.flush()
        return employer

    if employer.verification_status in LOCKED:
        raise AppError(
            "employer_profile_locked",
            "Your profile cannot be edited while it is under review or suspended.",
            status=409,
        )
    key_changed = any(getattr(employer, name) != values[name] for name in KEY_FIELDS)
    for name, value in values.items():
        setattr(employer, name, value)
    db.flush()
    if employer.verification_status == S.APPROVED and key_changed:
        change_status(
            db,
            employer,
            S.PENDING,
            actor=user,
            reason="Company name or registration number was changed.",
            ip=ip,
        )
    return employer


def missing_for_submission(employer: Employer) -> dict[str, str]:
    """What a complete profile still lacks: the checklist an admin will look at."""
    missing: dict[str, str] = {}
    if not employer.registration_number:
        missing["registration_number"] = "Enter your company registration number."
    if not employer.description:
        missing["description"] = "Describe what your company does."
    if not employer.contact_phone and not employer.website:
        message = "Give a working phone number or a website so we can check the company."
        missing["contact_phone"] = message
        missing["website"] = message
    return missing


def submit_my_employer(db: Session, user: User, *, ip: str | None = None) -> Employer:
    employer = get_my_employer(db, user)
    if employer.verification_status not in SUBMITTABLE:
        raise _invalid_transition(employer.verification_status, S.PENDING)
    if missing := missing_for_submission(employer):
        raise AppError(
            "profile_incomplete",
            "Complete your company profile before submitting it.",
            status=422,
            details={"fields": missing},
        )
    change_status(db, employer, S.PENDING, actor=user, ip=ip)
    return employer

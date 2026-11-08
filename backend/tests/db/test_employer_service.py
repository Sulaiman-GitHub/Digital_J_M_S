"""change_status: history rows, audit events, reasons and who may do what."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import normalise_email
from app.models import (
    AuditEvent,
    District,
    Employer,
    EmployerVerificationEvent,
    User,
    UserRole,
    VerificationStatus,
)
from app.services import employers as service

S = VerificationStatus


def make_user(db: Session, email: str, role: UserRole) -> User:
    user = User(email=email, email_normalized=normalise_email(email), role=role)
    db.add(user)
    db.flush()
    return user


@pytest.fixture
def owner(db_session: Session) -> User:
    return make_user(db_session, "boss@example.com", UserRole.EMPLOYER)


@pytest.fixture
def admin(db_session: Session) -> User:
    return make_user(db_session, "admin@example.com", UserRole.ADMIN)


def employer_in(db: Session, owner: User, status: S = S.DRAFT) -> Employer:
    district = db.scalar(select(District)) or District(name="Gulu", region="Northern")
    db.add(district)
    db.flush()
    employer = Employer(
        owner_user_id=owner.id,
        company_name="Ssese Foods Ltd",
        district_id=district.id,
        verification_status=status,
    )
    db.add(employer)
    db.flush()
    return employer


def history(db: Session, employer: Employer) -> list[EmployerVerificationEvent]:
    return list(
        db.scalars(
            select(EmployerVerificationEvent)
            .where(EmployerVerificationEvent.employer_id == employer.id)
            .order_by(EmployerVerificationEvent.created_at, EmployerVerificationEvent.id)
        )
    )


def audit(db: Session, employer: Employer) -> list[AuditEvent]:
    return list(db.scalars(select(AuditEvent).where(AuditEvent.entity_id == employer.id)))


def test_a_submission_is_recorded(db_session: Session, owner: User) -> None:
    employer = employer_in(db_session, owner)

    service.change_status(db_session, employer, S.PENDING, actor=owner)

    assert employer.verification_status == S.PENDING
    assert employer.submitted_at is not None and employer.decided_at is None
    (event,) = history(db_session, employer)
    assert (event.from_status, event.to_status) == (S.DRAFT, S.PENDING)
    assert event.actor_user_id == owner.id and event.reason is None


def test_every_change_writes_a_history_row_and_an_audit_event(
    db_session: Session, owner: User, admin: User
) -> None:
    employer = employer_in(db_session, owner)

    service.change_status(db_session, employer, S.PENDING, actor=owner)
    service.change_status(db_session, employer, S.REJECTED, actor=admin, reason="No registration.")
    service.change_status(db_session, employer, S.PENDING, actor=owner)
    service.change_status(db_session, employer, S.APPROVED, actor=admin)
    service.change_status(db_session, employer, S.SUSPENDED, actor=admin, reason="Complaint.")
    service.change_status(db_session, employer, S.APPROVED, actor=admin)

    path = [(e.from_status, e.to_status) for e in history(db_session, employer)]
    assert path == [
        (S.DRAFT, S.PENDING),
        (S.PENDING, S.REJECTED),
        (S.REJECTED, S.PENDING),
        (S.PENDING, S.APPROVED),
        (S.APPROVED, S.SUSPENDED),
        (S.SUSPENDED, S.APPROVED),
    ]
    events = audit(db_session, employer)
    assert sorted(e.action for e in events) == sorted(
        [
            "employer_pending",
            "employer_rejected",
            "employer_pending",
            "employer_approved",
            "employer_suspended",
            "employer_approved",
        ]
    )
    rejected = next(e for e in events if e.action == "employer_rejected")
    assert rejected.actor_user_id == admin.id
    assert rejected.entity_type == "employer"
    assert rejected.event_metadata == {
        "from": "pending",
        "to": "rejected",
        "reason": "No registration.",
    }


def test_decisions_set_decided_at_and_resubmitting_clears_it(
    db_session: Session, owner: User, admin: User
) -> None:
    employer = employer_in(db_session, owner, S.PENDING)

    service.change_status(db_session, employer, S.REJECTED, actor=admin, reason="Unclear.")
    assert employer.decided_at is not None

    service.change_status(db_session, employer, S.PENDING, actor=owner)
    assert employer.decided_at is None and employer.submitted_at is not None


@pytest.mark.parametrize("to", [S.REJECTED, S.SUSPENDED])
@pytest.mark.parametrize("reason", [None, "", "   \n "])
def test_reject_and_suspend_need_a_real_reason(
    db_session: Session, owner: User, admin: User, to: S, reason: str | None
) -> None:
    employer = employer_in(db_session, owner, S.PENDING if to == S.REJECTED else S.APPROVED)
    before = employer.verification_status

    with pytest.raises(AppError) as caught:
        service.change_status(db_session, employer, to, actor=admin, reason=reason)

    assert (caught.value.code, caught.value.status) == ("reason_required", 422)
    assert caught.value.details == {"fields": {"reason": "Give a reason."}}
    assert employer.verification_status == before
    assert history(db_session, employer) == [] and audit(db_session, employer) == []


def test_the_reason_is_trimmed_and_length_limited(
    db_session: Session, owner: User, admin: User
) -> None:
    employer = employer_in(db_session, owner, S.PENDING)

    with pytest.raises(AppError):
        service.change_status(db_session, employer, S.REJECTED, actor=admin, reason="x" * 1001)

    service.change_status(db_session, employer, S.REJECTED, actor=admin, reason="  Needs a TIN.  ")
    assert history(db_session, employer)[0].reason == "Needs a TIN."


def test_an_employer_cannot_approve_themselves(db_session: Session, owner: User) -> None:
    employer = employer_in(db_session, owner, S.PENDING)

    with pytest.raises(AppError) as caught:
        service.change_status(db_session, employer, S.APPROVED, actor=owner)

    assert (caught.value.code, caught.value.status) == ("invalid_verification_transition", 409)
    assert employer.verification_status == S.PENDING
    assert history(db_session, employer) == []


@pytest.mark.parametrize(
    ("start", "to"),
    [
        (S.DRAFT, S.APPROVED),
        (S.DRAFT, S.REJECTED),
        (S.PENDING, S.DRAFT),
        (S.PENDING, S.SUSPENDED),
        (S.APPROVED, S.REJECTED),
        (S.APPROVED, S.DRAFT),
        (S.REJECTED, S.APPROVED),
        (S.SUSPENDED, S.PENDING),
        (S.SUSPENDED, S.REJECTED),
        (S.PENDING, S.PENDING),
    ],
)
def test_forbidden_transitions_raise_409_and_change_nothing(
    db_session: Session, owner: User, admin: User, start: S, to: S
) -> None:
    employer = employer_in(db_session, owner, start)

    for actor in (owner, admin):
        with pytest.raises(AppError) as caught:
            service.change_status(db_session, employer, to, actor=actor, reason="Because.")
        assert (caught.value.code, caught.value.status) == ("invalid_verification_transition", 409)

    assert employer.verification_status == start
    assert history(db_session, employer) == [] and audit(db_session, employer) == []


def test_a_job_seeker_cannot_change_any_status(db_session: Session, owner: User) -> None:
    seeker = make_user(db_session, "seeker@example.com", UserRole.JOB_SEEKER)
    employer = employer_in(db_session, owner)

    with pytest.raises(AppError):
        service.change_status(db_session, employer, S.PENDING, actor=seeker)


def test_the_reason_of_a_rejection_is_shown_until_the_status_changes(
    db_session: Session, owner: User, admin: User
) -> None:
    employer = employer_in(db_session, owner, S.PENDING)
    assert service.status_reason(db_session, employer) is None

    service.change_status(db_session, employer, S.REJECTED, actor=admin, reason="First reason.")
    assert service.status_reason(db_session, employer) == "First reason."

    service.change_status(db_session, employer, S.PENDING, actor=owner)
    assert service.status_reason(db_session, employer) is None

    service.change_status(db_session, employer, S.REJECTED, actor=admin, reason="Second reason.")
    assert service.status_reason(db_session, employer) == "Second reason."

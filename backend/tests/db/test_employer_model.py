"""The database enforces the employer rules itself, whatever the API does."""

from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import normalise_email
from app.models import (
    District,
    Employer,
    EmployerVerificationEvent,
    User,
    UserRole,
    VerificationStatus,
)

S = VerificationStatus


def make_user(db: Session, email: str = "boss@example.com") -> User:
    user = User(email=email, email_normalized=normalise_email(email), role=UserRole.EMPLOYER)
    db.add(user)
    db.flush()
    return user


def make_district(db: Session) -> District:
    district = District(name="Gulu", region="Northern")
    db.add(district)
    db.flush()
    return district


def make_employer(db: Session, user: User | None = None, **extra: object) -> Employer:
    user = user or make_user(db)
    district = db.scalar(select(District)) or make_district(db)
    employer = Employer(
        owner_user_id=user.id, company_name="Ssese Foods Ltd", district_id=district.id, **extra
    )
    db.add(employer)
    db.flush()
    return employer


def test_a_new_employer_is_a_draft(db_session: Session) -> None:
    employer = make_employer(db_session)
    db_session.refresh(employer)

    assert employer.verification_status == S.DRAFT
    assert employer.submitted_at is None and employer.decided_at is None
    assert employer.created_at.tzinfo is not None


def test_a_user_has_at_most_one_company(db_session: Session) -> None:
    user = make_user(db_session)
    make_employer(db_session, user)

    with pytest.raises(IntegrityError, match="uq_employers_owner_user_id"):
        make_employer(db_session, user)


def test_the_status_must_be_one_of_the_five(db_session: Session) -> None:
    employer = make_employer(db_session)

    with pytest.raises(IntegrityError, match="ck_employers_verification_status"):
        db_session.execute(
            text("update employers set verification_status = 'banned' where id = :i"),
            {"i": employer.id},
        )


def test_a_company_needs_an_existing_district(db_session: Session) -> None:
    user = make_user(db_session)

    with pytest.raises(IntegrityError, match="fk_employers_district_id_districts"):
        db_session.add(Employer(owner_user_id=user.id, company_name="X Ltd", district_id=uuid4()))
        db_session.flush()


def test_a_used_district_cannot_be_deleted(db_session: Session) -> None:
    employer = make_employer(db_session)

    with pytest.raises(IntegrityError, match="fk_employers_district_id_districts"):
        db_session.execute(delete(District).where(District.id == employer.district_id))


def add_event(db: Session, employer: Employer, to: S, reason: str | None) -> None:
    db.add(
        EmployerVerificationEvent(
            employer_id=employer.id, from_status=S.PENDING, to_status=to, reason=reason
        )
    )
    db.flush()


@pytest.mark.parametrize("to", [S.REJECTED, S.SUSPENDED])
@pytest.mark.parametrize("reason", [None, "", "   "])
def test_rejecting_or_suspending_needs_a_reason(
    db_session: Session, to: S, reason: str | None
) -> None:
    employer = make_employer(db_session)

    with pytest.raises(IntegrityError, match="ck_employer_verification_events_reason_required"):
        add_event(db_session, employer, to, reason)


@pytest.mark.parametrize("to", [S.APPROVED, S.PENDING])
def test_other_changes_need_no_reason(db_session: Session, to: S) -> None:
    add_event(db_session, make_employer(db_session), to, None)


def test_event_statuses_are_checked(db_session: Session) -> None:
    employer = make_employer(db_session)

    with pytest.raises(IntegrityError, match="ck_employer_verification_events_to_status"):
        db_session.execute(
            text(
                "insert into employer_verification_events (employer_id, from_status, to_status) "
                "values (:e, 'pending', 'banned')"
            ),
            {"e": employer.id},
        )


def test_deleting_the_user_removes_the_company_and_its_history(db_session: Session) -> None:
    user = make_user(db_session)
    employer = make_employer(db_session, user)
    add_event(db_session, employer, S.APPROVED, None)

    db_session.execute(delete(User).where(User.id == user.id))

    assert db_session.scalar(select(func.count()).select_from(Employer)) == 0
    assert db_session.scalar(select(func.count()).select_from(EmployerVerificationEvent)) == 0


def test_deleting_the_actor_keeps_the_history_row(db_session: Session) -> None:
    employer = make_employer(db_session)
    admin = make_user(db_session, "admin@example.com")
    db_session.add(
        EmployerVerificationEvent(
            employer_id=employer.id,
            from_status=S.PENDING,
            to_status=S.APPROVED,
            actor_user_id=admin.id,
        )
    )
    db_session.flush()

    db_session.execute(delete(User).where(User.id == admin.id))

    event = db_session.scalars(select(EmployerVerificationEvent)).one()
    assert event.actor_user_id is None

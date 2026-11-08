"""The database enforces the consent rules itself, whatever the API does."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import normalise_email
from app.models import Consent, ConsentType, User, UserRole


def make_user(db: Session, email: str = "nakato@example.com") -> User:
    user = User(email=email, email_normalized=normalise_email(email), role=UserRole.JOB_SEEKER)
    db.add(user)
    db.flush()
    return user


def make_consent(db: Session, user: User, consent_type: str = "terms", **extra: object) -> Consent:
    consent = Consent(
        user_id=user.id, consent_type=ConsentType(consent_type), policy_version="v1", **extra
    )
    db.add(consent)
    db.flush()
    return consent


def test_defaults(db_session: Session) -> None:
    consent = make_consent(db_session, make_user(db_session))
    db_session.refresh(consent)

    assert consent.revoked_at is None
    assert consent.granted_at.tzinfo is not None


def test_only_one_active_consent_per_user_and_type(db_session: Session) -> None:
    user = make_user(db_session)
    make_consent(db_session, user, "terms")

    with pytest.raises(IntegrityError, match="uq_consents_user_id_consent_type_active"):
        make_consent(db_session, user, "terms")


def test_different_types_and_different_users_are_independent(db_session: Session) -> None:
    first = make_user(db_session, "a@example.com")
    make_consent(db_session, first, "terms")
    make_consent(db_session, first, "privacy")
    make_consent(db_session, make_user(db_session, "b@example.com"), "terms")


def test_revoked_rows_do_not_count_towards_the_rule(db_session: Session) -> None:
    user = make_user(db_session)
    old = make_consent(db_session, user, "terms")
    old.revoked_at = datetime.now(UTC)
    db_session.flush()

    make_consent(db_session, user, "terms")
    make_consent(db_session, user, "terms", revoked_at=datetime.now(UTC))

    total = db_session.scalar(select(func.count()).select_from(Consent))
    assert total == 3


def test_an_unknown_type_is_refused_by_the_database(db_session: Session) -> None:
    from sqlalchemy import text

    user = make_user(db_session)
    with pytest.raises(IntegrityError, match="ck_consents_consent_type"):
        db_session.execute(
            text(
                "insert into consents (user_id, consent_type, policy_version) "
                "values (:u, 'sell_my_data', 'v1')"
            ),
            {"u": user.id},
        )


def test_a_consent_belongs_to_an_existing_user(db_session: Session) -> None:
    with pytest.raises(IntegrityError, match="fk_consents_user_id_users"):
        db_session.add(Consent(user_id=uuid4(), consent_type=ConsentType.TERMS, policy_version="v"))
        db_session.flush()


def test_deleting_a_user_removes_their_consents(db_session: Session) -> None:
    user = make_user(db_session)
    make_consent(db_session, user, "terms")
    make_consent(db_session, user, "privacy")

    db_session.execute(delete(User).where(User.id == user.id))

    assert db_session.scalar(select(func.count()).select_from(Consent)) == 0

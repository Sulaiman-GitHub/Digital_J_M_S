"""The database enforces the CV rules itself, whatever the API does."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

from app.core.security import normalise_email
from app.integrations.storage import new_key
from app.models import Cv, User, UserRole

SHA = "a" * 64


def make_user(db: Session, email: str = "nakato@example.com") -> User:
    user = User(email=email, email_normalized=normalise_email(email), role=UserRole.JOB_SEEKER)
    db.add(user)
    db.flush()
    return user


def make_cv(db: Session, user: User, **overrides: object) -> Cv:
    values: dict[str, object] = {
        "user_id": user.id,
        "original_filename": "cv.pdf",
        "storage_key": new_key(),
        "content_type": "application/pdf",
        "size_bytes": 1234,
        "sha256": SHA,
    }
    values.update(overrides)
    cv = Cv(**values)
    db.add(cv)
    db.flush()
    return cv


def test_defaults(db_session: Session) -> None:
    cv = make_cv(db_session, make_user(db_session))
    db_session.refresh(cv)

    assert cv.deleted_at is None
    assert cv.created_at.tzinfo is not None
    assert len(cv.storage_key) == 32


def test_a_user_can_have_only_one_active_cv(db_session: Session) -> None:
    user = make_user(db_session)
    make_cv(db_session, user)

    with pytest.raises(IntegrityError, match="uq_cvs_user_id_active"):
        make_cv(db_session, user)


def test_deleted_cvs_do_not_count_towards_the_one_active_rule(db_session: Session) -> None:
    user = make_user(db_session)
    first = make_cv(db_session, user)
    first.deleted_at = datetime.now(UTC)
    db_session.flush()

    make_cv(db_session, user)  # a new active one is fine
    make_cv(db_session, user, deleted_at=datetime.now(UTC))  # and any number of deleted ones

    total = db_session.scalar(select(func.count()).select_from(Cv).where(Cv.user_id == user.id))
    active = db_session.scalar(
        select(func.count()).select_from(Cv).where(Cv.user_id == user.id, Cv.deleted_at.is_(None))
    )
    assert (total, active) == (3, 1)


def test_two_users_can_each_have_a_cv(db_session: Session) -> None:
    make_cv(db_session, make_user(db_session, "a@example.com"))
    make_cv(db_session, make_user(db_session, "b@example.com"))


def test_storage_keys_are_unique(db_session: Session) -> None:
    key = new_key()
    make_cv(db_session, make_user(db_session, "a@example.com"), storage_key=key)

    with pytest.raises(IntegrityError, match="uq_cvs_storage_key"):
        make_cv(db_session, make_user(db_session, "b@example.com"), storage_key=key)


@pytest.mark.parametrize("size", [0, -1])
def test_the_size_must_be_positive(db_session: Session, size: int) -> None:
    with pytest.raises(IntegrityError, match="ck_cvs_size_positive"):
        make_cv(db_session, make_user(db_session), size_bytes=size)


@pytest.mark.parametrize("sha", ["", "abc", "a" * 63])
def test_a_short_hash_is_refused(db_session: Session, sha: str) -> None:
    with pytest.raises(IntegrityError, match="ck_cvs_sha256_length"):
        make_cv(db_session, make_user(db_session), sha256=sha)


def test_a_long_hash_is_refused_by_the_column_length(db_session: Session) -> None:
    with pytest.raises(DataError):
        make_cv(db_session, make_user(db_session), sha256="a" * 65)


def test_a_cv_belongs_to_an_existing_user(db_session: Session) -> None:
    with pytest.raises(IntegrityError, match="fk_cvs_user_id_users"):
        db_session.add(
            Cv(
                user_id=uuid4(),
                original_filename="x.pdf",
                storage_key=new_key(),
                content_type="application/pdf",
                size_bytes=1,
                sha256=SHA,
            )
        )
        db_session.flush()


def test_deleting_a_user_removes_their_cv_rows(db_session: Session) -> None:
    user = make_user(db_session)
    make_cv(db_session, user)
    make_cv(db_session, user, deleted_at=datetime.now(UTC))

    db_session.execute(delete(User).where(User.id == user.id))

    assert db_session.scalar(select(func.count()).select_from(Cv)) == 0

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, normalise_email, verify_password
from app.models import AuditEvent, User, UserRole, UserStatus
from app.services.admin_setup import (
    AdminSetupError,
    AdminSetupResult,
    create_or_promote_admin,
    find_user,
)

ADMIN = "admin@example.com"
STRONG = "Rwenzori-Peaks-2026"


def _existing(
    db: Session, email: str, role: UserRole, status: UserStatus = UserStatus.ACTIVE
) -> User:
    user = User(
        email=email,
        email_normalized=normalise_email(email),
        password_hash=hash_password("Their-Own-Pass-123"),
        role=role,
        status=status,
    )
    db.add(user)
    db.flush()
    return user


def _actions(db: Session) -> list[str]:
    return [e.action for e in db.scalars(select(AuditEvent).order_by(AuditEvent.created_at))]


def test_creates_a_verified_admin_with_a_hashed_password(db_session: Session) -> None:
    result = create_or_promote_admin(db_session, ADMIN, STRONG)

    assert result is AdminSetupResult.CREATED
    admin = find_user(db_session, ADMIN)
    assert admin is not None
    assert admin.role is UserRole.ADMIN
    assert admin.status is UserStatus.ACTIVE
    assert admin.email_verified_at is not None
    assert admin.password_hash and admin.password_hash.startswith("$argon2id$")
    assert verify_password(admin.password_hash, STRONG)
    assert _actions(db_session) == ["admin_created"]


def test_running_again_changes_nothing(db_session: Session) -> None:
    create_or_promote_admin(db_session, ADMIN, STRONG)
    before = find_user(db_session, ADMIN).password_hash  # type: ignore[union-attr]

    result = create_or_promote_admin(db_session, ADMIN, "A-Different-Pass-99")

    assert result is AdminSetupResult.ALREADY_ADMIN
    assert find_user(db_session, ADMIN).password_hash == before  # type: ignore[union-attr]
    assert db_session.scalar(select(User.id).where(User.role == UserRole.ADMIN)) is not None
    assert _actions(db_session) == ["admin_created"]


def test_email_is_matched_in_any_case(db_session: Session) -> None:
    create_or_promote_admin(db_session, ADMIN, STRONG)

    assert create_or_promote_admin(db_session, "  ADMIN@Example.com ", None) is (
        AdminSetupResult.ALREADY_ADMIN
    )


@pytest.mark.parametrize("role", [UserRole.JOB_SEEKER, UserRole.EMPLOYER])
def test_an_existing_non_admin_is_refused_without_promote(
    db_session: Session, role: UserRole
) -> None:
    _existing(db_session, ADMIN, role)

    with pytest.raises(AdminSetupError, match="--promote"):
        create_or_promote_admin(db_session, ADMIN, STRONG)

    assert find_user(db_session, ADMIN).role is role  # type: ignore[union-attr]


def test_promote_makes_an_existing_account_a_verified_admin_and_keeps_its_password(
    db_session: Session,
) -> None:
    user = _existing(db_session, ADMIN, UserRole.EMPLOYER)
    old_hash = user.password_hash

    result = create_or_promote_admin(db_session, ADMIN, None, promote=True)

    assert result is AdminSetupResult.PROMOTED
    assert user.role is UserRole.ADMIN
    assert user.email_verified_at is not None
    assert user.password_hash == old_hash
    event = db_session.scalars(select(AuditEvent)).one()
    assert event.action == "admin_promoted"
    assert event.event_metadata == {"previous_role": "employer"}


@pytest.mark.parametrize("status", [UserStatus.SUSPENDED, UserStatus.DELETED])
def test_suspended_or_deleted_accounts_are_refused_even_with_promote(
    db_session: Session, status: UserStatus
) -> None:
    _existing(db_session, ADMIN, UserRole.JOB_SEEKER, status)

    with pytest.raises(AdminSetupError, match=status.value):
        create_or_promote_admin(db_session, ADMIN, STRONG, promote=True)


@pytest.mark.parametrize(
    ("password", "reason"),
    [
        ("Short-pass1", "at least 12"),
        ("password1234", "too common"),  # 12 characters, but on the common list
        ("administrator", "too common"),
        ("admin@example.com", "email"),
    ],
)
def test_weak_admin_passwords_are_refused(db_session: Session, password: str, reason: str) -> None:
    with pytest.raises(AdminSetupError, match=reason):
        create_or_promote_admin(db_session, ADMIN, password)

    assert find_user(db_session, ADMIN) is None


def test_creating_needs_a_password(db_session: Session) -> None:
    with pytest.raises(AdminSetupError, match="password"):
        create_or_promote_admin(db_session, ADMIN, None)

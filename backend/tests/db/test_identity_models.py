"""Identity tables: the database itself must enforce the rules."""

import uuid
from datetime import UTC, datetime, timedelta
from ipaddress import IPv4Address, ip_address

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError, StatementError
from sqlalchemy.orm import Session

from app.core.security import normalise_email
from app.models import (
    AuditEvent,
    AuthIdentity,
    AuthSession,
    EmailToken,
    EmailTokenPurpose,
    User,
    UserRole,
    UserStatus,
)

SOON = datetime.now(UTC) + timedelta(hours=1)


def make_user(
    db: Session, email: str = "nakato@example.com", role: UserRole = UserRole.JOB_SEEKER
) -> User:
    user = User(email=email.strip(), email_normalized=normalise_email(email), role=role)
    db.add(user)
    db.flush()
    return user


def constraint_violated(exc: pytest.ExceptionInfo[IntegrityError]) -> str | None:
    return getattr(exc.value.orig.diag, "constraint_name", None)  # type: ignore[union-attr]


# ---------- users: email ----------


def test_same_email_with_different_case_and_spaces_is_rejected(db_session: Session) -> None:
    make_user(db_session, "nakato@example.com")

    with pytest.raises(IntegrityError) as exc:
        make_user(db_session, "  NAKATO@Example.COM ")

    assert constraint_violated(exc) == "uq_users_email_normalized"


@pytest.mark.parametrize(
    "bad", ["Nakato@example.com", " nakato@example.com", "nakato@example.com "]
)
def test_database_rejects_email_normalized_that_is_not_normalised(
    db_session: Session, bad: str
) -> None:
    db_session.add(User(email=bad, email_normalized=bad, role=UserRole.JOB_SEEKER))

    with pytest.raises(IntegrityError) as exc:
        db_session.flush()

    assert constraint_violated(exc) == "ck_users_email_normalized_is_normalized"


def test_original_email_spelling_is_kept_for_display(db_session: Session) -> None:
    user = make_user(db_session, "Nakato.Sarah@Example.com")

    assert user.email == "Nakato.Sarah@Example.com"
    assert user.email_normalized == "nakato.sarah@example.com"


# ---------- users: enums ----------


def test_orm_refuses_an_unknown_role(db_session: Session) -> None:
    db_session.add(User(email="a@b.ug", email_normalized="a@b.ug", role="superuser"))

    with pytest.raises((StatementError, LookupError)):
        db_session.flush()


@pytest.mark.parametrize(
    ("column", "value", "constraint"),
    [
        ("role", "superuser", "ck_users_user_role"),
        ("status", "banned", "ck_users_user_status"),
    ],
)
def test_database_refuses_unknown_role_or_status_even_with_raw_sql(
    db_session: Session, column: str, value: str, constraint: str
) -> None:
    values = {"role": "job_seeker", "status": "active", column: value}

    with pytest.raises(IntegrityError) as exc:
        db_session.execute(
            text(
                "INSERT INTO users (email, email_normalized, role, status) "
                "VALUES ('x@y.ug', 'x@y.ug', :role, :status)"
            ),
            values,
        )

    assert constraint_violated(exc) == constraint


def test_database_refuses_unknown_email_token_purpose(db_session: Session) -> None:
    user = make_user(db_session)

    with pytest.raises(IntegrityError) as exc:
        db_session.execute(
            text(
                "INSERT INTO email_tokens (user_id, purpose, token_hash, expires_at) "
                "VALUES (:user_id, 'login', :token_hash, now() + interval '1 hour')"
            ),
            {"user_id": user.id, "token_hash": "a" * 64},
        )

    assert constraint_violated(exc) == "ck_email_tokens_email_token_purpose"


def test_enum_values_are_stored_as_lowercase_values(db_session: Session) -> None:
    user = make_user(db_session, role=UserRole.JOB_SEEKER)

    stored = db_session.execute(
        text("SELECT role, status FROM users WHERE id = :id"), {"id": user.id}
    ).one()

    assert tuple(stored) == ("job_seeker", "active")


# ---------- defaults and timestamps ----------


def test_user_defaults(db_session: Session) -> None:
    user = make_user(db_session)
    db_session.refresh(user)

    assert isinstance(user.id, uuid.UUID)
    assert user.status is UserStatus.ACTIVE
    assert user.password_hash is None
    assert user.email_verified_at is None
    assert user.last_login_at is None
    assert user.deleted_at is None
    assert user.created_at.tzinfo is not None
    assert user.updated_at >= user.created_at


def test_server_defaults_apply_to_raw_inserts(db_session: Session) -> None:
    row = db_session.execute(
        text(
            "INSERT INTO users (email, email_normalized, role) "
            "VALUES ('raw@example.com', 'raw@example.com', 'employer') "
            "RETURNING id, status, created_at, updated_at"
        )
    ).one()

    assert isinstance(row.id, uuid.UUID)
    assert row.status == "active"
    assert row.created_at is not None and row.updated_at is not None


def test_updated_at_moves_forward_on_update(db_session: Session) -> None:
    user = make_user(db_session)
    long_ago = datetime(2020, 1, 1, tzinfo=UTC)
    db_session.execute(
        text("UPDATE users SET created_at = :t, updated_at = :t WHERE id = :id"),
        {"t": long_ago, "id": user.id},
    )
    db_session.expire(user)

    user.last_login_at = datetime.now(UTC)
    db_session.flush()
    db_session.refresh(user)

    assert user.created_at == long_ago
    assert user.updated_at > long_ago


# ---------- sessions, email tokens, identities ----------


def test_session_token_hash_is_unique(db_session: Session) -> None:
    user = make_user(db_session)
    for _ in range(2):
        db_session.add(
            AuthSession(
                user_id=user.id, token_hash="t" * 64, csrf_token_hash="c" * 64, expires_at=SOON
            )
        )

    with pytest.raises(IntegrityError) as exc:
        db_session.flush()

    assert constraint_violated(exc) == "uq_sessions_token_hash"


def test_session_stores_ip_address_and_user_agent(db_session: Session) -> None:
    user = make_user(db_session)
    session = AuthSession(
        user_id=user.id,
        token_hash="s" * 64,
        csrf_token_hash="c" * 64,
        expires_at=SOON,
        user_agent="Mozilla/5.0 (Android 14)",
        ip_address=ip_address("102.134.1.5"),
    )
    db_session.add(session)
    db_session.flush()
    db_session.expire(session)

    assert session.ip_address == IPv4Address("102.134.1.5")
    assert session.revoked_at is None


def test_email_token_hash_is_unique(db_session: Session) -> None:
    user = make_user(db_session)
    for purpose in (EmailTokenPurpose.VERIFY_EMAIL, EmailTokenPurpose.RESET_PASSWORD):
        db_session.add(
            EmailToken(user_id=user.id, purpose=purpose, token_hash="e" * 64, expires_at=SOON)
        )

    with pytest.raises(IntegrityError) as exc:
        db_session.flush()

    assert constraint_violated(exc) == "uq_email_tokens_token_hash"


def test_provider_and_subject_pair_is_unique(db_session: Session) -> None:
    first = make_user(db_session, "a@example.com")
    second = make_user(db_session, "b@example.com")
    db_session.add(AuthIdentity(user_id=first.id, provider="google", provider_subject="123"))
    db_session.add(AuthIdentity(user_id=second.id, provider="google", provider_subject="123"))

    with pytest.raises(IntegrityError) as exc:
        db_session.flush()

    assert constraint_violated(exc) == "uq_auth_identities_provider_provider_subject"


def test_same_subject_at_a_different_provider_is_allowed(db_session: Session) -> None:
    user = make_user(db_session)
    db_session.add(AuthIdentity(user_id=user.id, provider="google", provider_subject="123"))
    db_session.add(AuthIdentity(user_id=user.id, provider="microsoft", provider_subject="123"))

    db_session.flush()


def test_rows_must_belong_to_an_existing_user(db_session: Session) -> None:
    db_session.add(
        AuthSession(
            user_id=uuid.uuid4(), token_hash="x" * 64, csrf_token_hash="c" * 64, expires_at=SOON
        )
    )

    with pytest.raises(IntegrityError) as exc:
        db_session.flush()

    assert constraint_violated(exc) == "fk_sessions_user_id_users"


# ---------- audit events ----------


def test_audit_event_defaults(db_session: Session) -> None:
    event = AuditEvent(action="login_failed")
    db_session.add(event)
    db_session.flush()
    db_session.refresh(event)

    assert event.event_metadata == {}
    assert event.actor_user_id is None
    assert event.created_at.tzinfo is not None
    assert not hasattr(event, "updated_at")


# ---------- deleting a user ----------


def test_hard_deleting_a_user_removes_credentials_but_keeps_audit_events(
    db_session: Session,
) -> None:
    user = make_user(db_session)
    db_session.add_all(
        [
            AuthSession(
                user_id=user.id, token_hash="d" * 64, csrf_token_hash="c" * 64, expires_at=SOON
            ),
            EmailToken(
                user_id=user.id,
                purpose=EmailTokenPurpose.VERIFY_EMAIL,
                token_hash="v" * 64,
                expires_at=SOON,
            ),
            AuthIdentity(user_id=user.id, provider="google", provider_subject="abc"),
            AuditEvent(
                actor_user_id=user.id,
                action="profile_updated",
                entity_type="user",
                entity_id=user.id,
                event_metadata={"fields": ["phone"]},
            ),
        ]
    )
    db_session.flush()
    user_id = user.id

    db_session.delete(user)
    db_session.flush()
    db_session.expire_all()

    def count(model: type) -> int:
        return db_session.scalar(select(func.count()).select_from(model)) or 0

    assert count(AuthSession) == 0
    assert count(EmailToken) == 0
    assert count(AuthIdentity) == 0

    event = db_session.scalars(select(AuditEvent)).one()
    assert event.actor_user_id is None  # SET NULL: the log survives the user
    assert event.entity_id == user_id  # the record still says what it was about
    assert event.event_metadata == {"fields": ["phone"]}

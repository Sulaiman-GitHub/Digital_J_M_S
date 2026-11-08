"""Authentication rules.

Errors are AppError (rendered in the error envelope). Routes only translate HTTP to these calls.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import (
    generate_token,
    hash_password,
    hash_token,
    normalise_email,
    password_needs_rehash,
    password_problem,
    verify_password,
)
from app.integrations.email import EmailMessage, password_reset_email, verification_email
from app.models import (
    AuditEvent,
    AuthSession,
    EmailToken,
    EmailTokenPurpose,
    User,
    UserRole,
    UserStatus,
)
from app.services import consents as consent_service
from app.services.audit import parse_ip, record_event

VERIFY_EMAIL_TTL = timedelta(hours=24)
RESET_PASSWORD_TTL = timedelta(hours=1)
LOCKOUT_THRESHOLD = 5
LOCKOUT_WINDOW = timedelta(minutes=15)
USER_AGENT_MAX_LENGTH = 512


@dataclass(frozen=True)
class LoginResult:
    user: User
    session_token: str
    csrf_token: str
    expires_at: datetime


def _now() -> datetime:
    return datetime.now(UTC)


# ---------- errors ----------


def _weak_password(field: str, problem: str) -> AppError:
    return AppError(
        "validation_error",
        "Some fields are invalid.",
        status=422,
        details={"fields": {field: problem}},
    )


def _invalid_credentials() -> AppError:
    return AppError("invalid_credentials", "Invalid email or password.", status=401)


def _token_error(code: str) -> AppError:
    messages = {
        "token_invalid": "This link is not valid. Request a new one.",
        "token_expired": "This link has expired. Request a new one.",
        "token_used": "This link has already been used or was replaced by a newer one.",
    }
    return AppError(code, messages[code], status=400)


# ---------- email tokens ----------


def _issue_email_token(db: Session, user: User, purpose: EmailTokenPurpose, ttl: timedelta) -> str:
    """Create a single-use token and retire any earlier unused token for the same purpose."""
    now = _now()
    db.execute(
        update(EmailToken)
        .where(
            EmailToken.user_id == user.id,
            EmailToken.purpose == purpose,
            EmailToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    raw = generate_token()
    db.add(
        EmailToken(
            user_id=user.id, purpose=purpose, token_hash=hash_token(raw), expires_at=now + ttl
        )
    )
    db.flush()
    return raw


def _consume_email_token(db: Session, raw: str, purpose: EmailTokenPurpose) -> EmailToken:
    token = db.scalar(
        select(EmailToken)
        .where(EmailToken.token_hash == hash_token(raw), EmailToken.purpose == purpose)
        .with_for_update()
    )
    if token is None:
        raise _token_error("token_invalid")
    if token.used_at is not None:
        raise _token_error("token_used")
    if token.expires_at <= _now():
        raise _token_error("token_expired")
    token.used_at = _now()
    return token


def _frontend_link(path: str, token: str) -> str:
    return f"{get_settings().frontend_base_url.rstrip('/')}{path}?token={token}"


def verification_message(user: User, token: str) -> EmailMessage:
    content = verification_email(
        _frontend_link("/verify-email", token),
        expires_hours=int(VERIFY_EMAIL_TTL.total_seconds() // 3600),
    )
    return EmailMessage(user.email, content.subject, content.text_body, content.html_body)


def password_reset_message(user: User, token: str) -> EmailMessage:
    content = password_reset_email(
        _frontend_link("/reset-password", token),
        expires_minutes=int(RESET_PASSWORD_TTL.total_seconds() // 60),
    )
    return EmailMessage(user.email, content.subject, content.text_body, content.html_body)


# ---------- registration and verification ----------


def register_user(db: Session, *, email: str, password: str, role: str) -> tuple[User, str]:
    """Create a job seeker or employer. Returns the user and the raw verification token."""
    if role not in (UserRole.JOB_SEEKER, UserRole.EMPLOYER):
        # The schema already refuses other roles; this guards any other caller.
        raise AppError("forbidden", "This role cannot be chosen at registration.", status=403)
    if problem := password_problem(password, email):
        raise _weak_password("password", problem)

    normalized = normalise_email(email)
    email_taken = AppError(
        "email_taken",
        "An account with this email already exists. Log in or reset your password.",
        status=409,
    )
    if db.scalar(select(User.id).where(User.email_normalized == normalized)) is not None:
        raise email_taken

    user = User(
        email=email.strip(),
        email_normalized=normalized,
        password_hash=hash_password(password),
        role=UserRole(role),
    )
    try:
        with db.begin_nested():  # two simultaneous sign-ups: the unique constraint decides
            db.add(user)
    except IntegrityError:
        raise email_taken from None

    # The schema only lets a request through when the person accepted the Terms and Privacy Policy.
    consent_service.record_registration_consents(db, user)
    return user, _issue_email_token(db, user, EmailTokenPurpose.VERIFY_EMAIL, VERIFY_EMAIL_TTL)


def verify_email(db: Session, raw_token: str, *, ip: str | None = None) -> User:
    token = _consume_email_token(db, raw_token, EmailTokenPurpose.VERIFY_EMAIL)
    user = db.get_one(User, token.user_id)
    if user.email_verified_at is None:
        user.email_verified_at = _now()
        record_event(
            db,
            "email_verified",
            actor_user_id=user.id,
            entity_type="user",
            entity_id=user.id,
            ip=ip,
        )
    return user


def resend_verification(db: Session, user: User) -> str:
    if user.email_verified_at is not None:
        raise AppError("email_already_verified", "Your email is already verified.", status=409)
    return _issue_email_token(db, user, EmailTokenPurpose.VERIFY_EMAIL, VERIFY_EMAIL_TTL)


# ---------- login, sessions, logout ----------


def _recent_failures(db: Session, normalized_email: str, since: datetime) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(
                AuditEvent.action == "login_failed",
                AuditEvent.event_metadata["email"].astext == normalized_email,
                AuditEvent.created_at > since,
            )
        )
        or 0
    )


def _fail_login(
    db: Session, normalized: str, reason: str, user: User | None, ip: str | None
) -> None:
    """Record the failure and commit it, so it survives the error response's rollback."""
    record_event(
        db,
        "login_failed",
        actor_user_id=user.id if user else None,
        entity_type="user" if user else None,
        entity_id=user.id if user else None,
        metadata={"email": normalized, "reason": reason},
        ip=ip,
    )
    db.commit()


def authenticate(
    db: Session, *, email: str, password: str, ip: str | None, user_agent: str | None
) -> LoginResult:
    """Check the password and open a session.

    Unknown email and wrong password give the same error, after the same amount of work.
    """
    normalized = normalise_email(email)
    user = db.scalar(select(User).where(User.email_normalized == normalized))

    # Lockout: 5 failures within 15 minutes (counted since the last successful login).
    since = _now() - LOCKOUT_WINDOW
    if user is not None and user.last_login_at is not None:
        since = max(since, user.last_login_at)
    if _recent_failures(db, normalized, since) >= LOCKOUT_THRESHOLD:
        record_event(db, "login_locked", metadata={"email": normalized}, ip=ip)
        db.commit()
        raise AppError(
            "too_many_attempts",
            "Too many failed attempts. Wait 15 minutes or reset your password.",
            status=429,
        )

    password_ok = verify_password(user.password_hash if user else None, password)
    if user is None or not password_ok or user.status is UserStatus.DELETED:
        reason = "unknown_email" if user is None else "wrong_password"
        if user is not None and user.status is UserStatus.DELETED:
            reason = "account_deleted"
        _fail_login(db, normalized, reason, user, ip)
        raise _invalid_credentials()
    if user.status is UserStatus.SUSPENDED:
        # Only revealed after a correct password, so it does not leak which emails exist.
        record_event(
            db,
            "login_blocked",
            actor_user_id=user.id,
            entity_type="user",
            entity_id=user.id,
            metadata={"reason": "suspended"},
            ip=ip,
        )
        db.commit()
        raise AppError("account_suspended", "This account is suspended. Contact support.", 403)

    if user.password_hash and password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    now = _now()
    user.last_login_at = now

    session_token, csrf_token = generate_token(), generate_token()
    expires_at = now + timedelta(hours=get_settings().session_ttl_hours)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_token(session_token),
            csrf_token_hash=hash_token(csrf_token),
            expires_at=expires_at,
            user_agent=(user_agent or "")[:USER_AGENT_MAX_LENGTH] or None,
            ip_address=parse_ip(ip),
        )
    )
    db.flush()
    return LoginResult(user, session_token, csrf_token, expires_at)


def get_active_session(db: Session, raw_token: str) -> tuple[AuthSession, User] | None:
    """The live session and its active user, or None (unknown, revoked, expired, not active)."""
    row = db.execute(
        select(AuthSession, User)
        .join(User, User.id == AuthSession.user_id)
        .where(
            AuthSession.token_hash == hash_token(raw_token),
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > _now(),
        )
    ).one_or_none()
    if row is None:
        return None
    session, user = row
    if user.status is not UserStatus.ACTIVE:  # suspended users lose access immediately
        return None
    return session, user


def logout(session: AuthSession) -> None:
    session.revoked_at = _now()


# ---------- password reset ----------


def request_password_reset(db: Session, email: str, *, ip: str | None) -> tuple[User, str] | None:
    """A reset token for an active account, or None. The caller always answers 202."""
    user = db.scalar(select(User).where(User.email_normalized == normalise_email(email)))
    if user is None or user.status is not UserStatus.ACTIVE:
        return None
    record_event(
        db,
        "password_reset_requested",
        actor_user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        ip=ip,
    )
    return user, _issue_email_token(db, user, EmailTokenPurpose.RESET_PASSWORD, RESET_PASSWORD_TTL)


def reset_password(db: Session, raw_token: str, new_password: str, *, ip: str | None) -> User:
    """Set a new password and revoke every session of that user."""
    token = _consume_email_token(db, raw_token, EmailTokenPurpose.RESET_PASSWORD)
    user = db.get_one(User, token.user_id)
    if problem := password_problem(new_password, user.email):
        raise _weak_password("new_password", problem)

    now = _now()
    user.password_hash = hash_password(new_password)
    if user.email_verified_at is None:
        user.email_verified_at = now  # the reset link proved they can read this inbox
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    record_event(
        db, "password_reset", actor_user_id=user.id, entity_type="user", entity_id=user.id, ip=ip
    )
    return user

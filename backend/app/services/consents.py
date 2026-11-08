"""Consents. Always about the caller themselves.

- terms and privacy are given at registration and cannot be withdrawn here (leaving means closing
  the account).
- cv_sharing_with_employers is for job seekers, can be withdrawn at any time, and is needed before
  applying.
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import Consent, ConsentType, User, UserRole

REQUIRED_AT_REGISTRATION = (ConsentType.TERMS, ConsentType.PRIVACY)


def _active(db: Session, user: User, consent_type: ConsentType) -> Consent | None:
    return db.scalar(
        select(Consent).where(
            Consent.user_id == user.id,
            Consent.consent_type == consent_type,
            Consent.revoked_at.is_(None),
        )
    )


def list_active(db: Session, user: User) -> list[Consent]:
    return list(
        db.scalars(
            select(Consent)
            .where(Consent.user_id == user.id, Consent.revoked_at.is_(None))
            .order_by(Consent.granted_at, Consent.consent_type)
        )
    )


def has_active(db: Session, user: User, consent_type: ConsentType) -> bool:
    return _active(db, user, consent_type) is not None


def grant(db: Session, user: User, consent_type: ConsentType) -> None:
    """Record agreement to the current policy version. Repeating it changes nothing."""
    if consent_type is ConsentType.CV_SHARING_WITH_EMPLOYERS and user.role != UserRole.JOB_SEEKER:
        raise AppError("forbidden", "Only job seekers can share a CV with employers.", status=403)
    version = get_settings().policy_version
    existing = _active(db, user, consent_type)
    if existing is not None:
        if existing.policy_version == version:
            return
        existing.revoked_at = datetime.now(UTC)  # replaced by agreement to the newer version
        db.flush()  # free the "one active row" slot before the new row goes in
    db.add(Consent(user_id=user.id, consent_type=consent_type, policy_version=version))
    db.flush()


def revoke(db: Session, user: User, consent_type: ConsentType) -> None:
    """Withdraw a consent. Withdrawing one that is not active changes nothing."""
    if consent_type in REQUIRED_AT_REGISTRATION:
        raise AppError(
            "consent_required",
            "The Terms and Privacy Policy cannot be withdrawn while you have an account.",
            status=422,
            details={"fields": {"consent_type": "This consent cannot be withdrawn."}},
        )
    existing = _active(db, user, consent_type)
    if existing is not None:
        existing.revoked_at = datetime.now(UTC)
        db.flush()


def record_registration_consents(db: Session, user: User) -> None:
    for consent_type in REQUIRED_AT_REGISTRATION:
        grant(db, user, consent_type)

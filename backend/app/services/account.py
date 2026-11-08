"""Account data features: export your data, and delete your account.

Deleting keeps the user row (so history, audit events and reports still point at something) but
removes everything personal: the email address, password, profile, CV files, cover notes and the
profile snapshot of every application. Applications stay for the employer as "Deleted user", with
their status history. A company keeps its vacancies and history but loses its contact details.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.security import verify_password
from app.models import (
    Application,
    AuthSession,
    Consent,
    Cv,
    EmailToken,
    Employer,
    ImageKind,
    SavedVacancy,
    SeekerProfile,
    User,
    UserImage,
    UserRole,
    UserStatus,
    Vacancy,
    VacancyStatus,
)
from app.schemas.consent import ConsentOut
from app.schemas.cv import CvOut
from app.schemas.employer import EmployerOut
from app.schemas.image import ImageOut
from app.schemas.profile import ProfileOut
from app.schemas.vacancy import VacancyOut
from app.services import applications as application_service
from app.services import employers as employer_service
from app.services import images as image_service
from app.services import profiles as profile_service
from app.services import vacancies as vacancy_service
from app.services.audit import record_event

DELETED_NAME = "Deleted user"


def _json(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="json")


# ---------- export ----------


def export_data(db: Session, user: User, *, ip: str | None = None) -> dict[str, Any]:
    """Everything stored about the caller, as plain data. Never anyone else's."""
    data: dict[str, Any] = {
        "exported_at": datetime.now(UTC).isoformat(),
        "account": {
            "id": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "email_verified": user.email_verified_at is not None,
            "created_at": user.created_at.isoformat(),
        },
        "consents": [
            _json(ConsentOut.from_consent(item))
            for item in db.scalars(select(Consent).where(Consent.user_id == user.id))
        ],
    }
    if user.role == UserRole.JOB_SEEKER:
        try:
            view = profile_service.get_my_profile(db, user)
            data["profile"] = _json(ProfileOut.build(view.profile, view.skills, view.experiences))
        except AppError:
            data["profile"] = None
        cv = db.scalar(select(Cv).where(Cv.user_id == user.id, Cv.deleted_at.is_(None)))
        data["cv"] = (
            {**_json(CvOut.model_validate(cv)), "download": "/api/v1/cv/me/download"}
            if cv
            else None
        )
        photo = image_service.active_image(db, user.id, ImageKind.PHOTO)
        data["photo"] = (
            {**_json(ImageOut.model_validate(photo)), "download": "/api/v1/photo/me/image"}
            if photo
            else None
        )
        data["saved_jobs"] = [
            {"vacancy_id": str(row.vacancy_id), "saved_at": row.created_at.isoformat()}
            for row in db.scalars(
                select(SavedVacancy)
                .where(SavedVacancy.user_id == user.id)
                .order_by(SavedVacancy.created_at)
            )
        ]
        data["applications"] = [
            _application(db, user, row.id)
            for row in db.scalars(
                select(Application)
                .where(Application.applicant_user_id == user.id)
                .order_by(Application.submitted_at)
            )
        ]
    elif user.role == UserRole.EMPLOYER:
        employer = employer_service.get_employer_for_user(db, user)
        data["company"] = (
            _json(EmployerOut.build(employer, None, employer_service.can_publish(employer)))
            if employer
            else None
        )
        logo = image_service.active_image(db, user.id, ImageKind.LOGO)
        data["logo"] = (
            {**_json(ImageOut.model_validate(logo)), "download": "/api/v1/logo/me/image"}
            if logo
            else None
        )
        data["vacancies"] = (
            [
                _json(VacancyOut.build(item.vacancy, item.requirements, item.is_live))
                for item in (
                    vacancy_service.view(db, vacancy)
                    for vacancy in db.scalars(
                        select(Vacancy).where(Vacancy.employer_id == employer.id)
                    )
                )
            ]
            if employer
            else []
        )
    record_event(
        db,
        "account_exported",
        actor_user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        ip=ip,
    )
    return data


def _application(db: Session, user: User, application_id: uuid.UUID) -> dict[str, Any]:
    view = application_service.get_application(db, user, application_id)
    application = view.application
    return {
        "id": str(application.id),
        "status": application.status.value,
        "submitted_at": application.submitted_at.isoformat(),
        "vacancy_title": view.vacancy.title,
        "company_name": view.company_name,
        "cover_note": application.cover_note,
        "profile_sent": application.profile_snapshot,
        "cv_sent": application.cv_original_filename,
        "history": [
            {
                "from_status": item.from_status.value if item.from_status else None,
                "to_status": item.to_status.value,
                "note": item.note,
                "at": item.created_at.isoformat(),
            }
            for item in view.history
        ],
    }


# ---------- delete ----------


def live_vacancy_count(db: Session, employer: Employer) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Vacancy)
            .where(Vacancy.employer_id == employer.id, vacancy_service.live_clause())
        )
        or 0
    )


def delete_account(db: Session, user: User, password: str, *, ip: str | None = None) -> list[str]:
    """Delete the caller's account. Returns the storage keys of files to remove AFTER the commit."""
    if user.role == UserRole.ADMIN:
        raise AppError("forbidden", "Admin accounts cannot be deleted here.", status=403)
    if not verify_password(user.password_hash, password):
        raise AppError("wrong_password", "That password is not correct.", status=403)

    employer = (
        employer_service.get_employer_for_user(db, user) if user.role == UserRole.EMPLOYER else None
    )
    if employer is not None and live_vacancy_count(db, employer) > 0:
        raise AppError(
            "live_vacancies",
            "Close your live vacancies before you delete your account.",
            status=409,
        )

    keys: list[str] = []
    now = datetime.now(UTC)

    # Personal data of a job seeker: profile, CV rows and files, and what applications carried.
    db.execute(delete(SeekerProfile).where(SeekerProfile.user_id == user.id))
    keys.extend(
        db.scalars(select(Cv.storage_key).where(Cv.user_id == user.id, Cv.deleted_at.is_(None)))
    )
    db.execute(delete(Cv).where(Cv.user_id == user.id))
    db.execute(delete(SavedVacancy).where(SavedVacancy.user_id == user.id))
    # Profile photo or company logo: the picture is personal data too.
    keys.extend(
        db.scalars(
            select(UserImage.storage_key).where(
                UserImage.user_id == user.id, UserImage.deleted_at.is_(None)
            )
        )
    )
    db.execute(delete(UserImage).where(UserImage.user_id == user.id))
    keys.extend(
        db.scalars(
            select(Application.cv_storage_key).where(Application.applicant_user_id == user.id)
        )
    )
    db.execute(
        update(Application)
        .where(Application.applicant_user_id == user.id)
        .values(
            cover_note=None,
            profile_snapshot={
                "full_name": DELETED_NAME,
                "deleted": True,
                "skills": [],
                "experiences": [],
            },
            cv_original_filename="deleted",
        )
    )

    # A company keeps its vacancies and history, but not its contact details; its vacancies close.
    if employer is not None:
        employer.company_name = "Deleted company"
        employer.registration_number = None
        employer.website = None
        employer.contact_phone = None
        employer.description = None
        db.execute(
            update(Vacancy)
            .where(Vacancy.employer_id == employer.id, Vacancy.status != VacancyStatus.CLOSED)
            .values(status=VacancyStatus.CLOSED)
        )

    db.execute(delete(EmailToken).where(EmailToken.user_id == user.id))
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    # The address is freed (it could register again) and nothing identifies the person any more.
    placeholder = f"deleted-{user.id.hex}@deleted.invalid"
    user.email = placeholder
    user.email_normalized = placeholder
    user.password_hash = None
    user.status = UserStatus.DELETED
    user.deleted_at = now
    record_event(
        db,
        "account_deleted",
        actor_user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        ip=ip,
    )
    db.flush()
    return keys

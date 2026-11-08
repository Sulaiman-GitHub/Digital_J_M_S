"""Seeker profiles.

A user's profile is found only through their own user id. There is no id in any URL and no
function here that returns someone else's profile, so ownership cannot be got wrong by a caller.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import (
    District,
    FieldOfStudy,
    Institution,
    ProfileExperience,
    ProfileSkill,
    QualificationLevel,
    SeekerProfile,
    Skill,
    StudyStatus,
    User,
)
from app.schemas.profile import ProfileIn

DISPLAY_TIME_ZONE = ZoneInfo("Africa/Kampala")  # stored in UTC, shown in Kampala time
EARLIEST_DATE = date(1970, 1, 1)
EXPECTED_COMPLETION_YEARS_AHEAD = 10

# Columns replaced by a PUT. Everything else (id, user_id, is_discoverable, created_at) is kept.
_PROFILE_COLUMNS = (
    "full_name",
    "phone",
    "institution_id",
    "institution_other_name",
    "qualification_level_id",
    "field_of_study_id",
    "field_of_study_other",
    "study_status",
    "expected_completion_date",
    "graduation_date",
    "district_id",
    "summary",
)


@dataclass(frozen=True)
class ProfileView:
    profile: SeekerProfile
    skills: list[Skill]
    experiences: list[ProfileExperience]


def today_in_kampala() -> date:
    return datetime.now(UTC).astimezone(DISPLAY_TIME_ZONE).date()


def _find_profile(db: Session, user: User) -> SeekerProfile | None:
    return db.scalar(
        select(SeekerProfile)
        .where(SeekerProfile.user_id == user.id)
        .execution_options(populate_existing=True)  # never serve a stale object after an upsert
    )


def _load_view(db: Session, profile: SeekerProfile) -> ProfileView:
    skills = list(
        db.scalars(
            select(Skill)
            .join(ProfileSkill, ProfileSkill.skill_id == Skill.id)
            .where(ProfileSkill.profile_id == profile.id)
            .order_by(Skill.name_normalized)
        )
    )
    experiences = list(
        db.scalars(
            select(ProfileExperience)
            .where(ProfileExperience.profile_id == profile.id)
            .order_by(ProfileExperience.start_date.desc(), ProfileExperience.created_at)
        )
    )
    return ProfileView(profile, skills, experiences)


def get_my_profile(db: Session, user: User) -> ProfileView:
    profile = _find_profile(db, user)
    if profile is None:
        raise AppError("profile_not_found", "You have not created your profile yet.", status=404)
    return _load_view(db, profile)


# ---------- validation that needs several fields or the database ----------


def _usable_ids(
    db: Session, model: type, wanted: set[uuid.UUID], already_chosen: set[uuid.UUID]
) -> set[uuid.UUID]:
    """Ids that exist and may be chosen: active ones, plus ones the profile already has.

    Keeping an already chosen value lets a user save other changes after an admin has switched
    that reference row off.
    """
    if not wanted:
        return set()
    rows = db.execute(select(model.id, model.is_active).where(model.id.in_(wanted))).all()  # type: ignore[attr-defined]
    return {id_ for id_, active in rows if active or id_ in already_chosen}


def _existing_ids(db: Session, model: type, wanted: set[uuid.UUID]) -> set[uuid.UUID]:
    if not wanted:
        return set()
    return set(db.scalars(select(model.id).where(model.id.in_(wanted))))  # type: ignore[attr-defined]


def profile_errors(
    db: Session,
    data: ProfileIn,
    current: SeekerProfile | None,
    current_skill_ids: set[uuid.UUID],
    today: date,
) -> dict[str, str]:
    """Every problem with the submitted profile, keyed by field, so a form shows them at once."""
    errors: dict[str, str] = {}

    # Institution: choose from the list OR type a name.
    if data.institution_id is None and data.institution_other_name is None:
        errors["institution_id"] = "Choose your institution, or type its name."
    elif data.institution_id is not None and data.institution_other_name is not None:
        errors["institution_other_name"] = "Choose from the list or type a name, not both."
    if data.field_of_study_id is not None and data.field_of_study_other is not None:
        errors["field_of_study_other"] = "Choose from the list or type a name, not both."

    # Study status decides which date makes sense.
    if data.study_status is StudyStatus.STUDYING and data.graduation_date is not None:
        errors["graduation_date"] = "Remove the graduation date while you are still studying."
    if data.study_status is StudyStatus.COMPLETED and data.expected_completion_date is not None:
        errors["expected_completion_date"] = (
            "Remove the expected completion date once you have completed your studies."
        )
    if data.graduation_date is not None and "graduation_date" not in errors:
        if data.graduation_date < EARLIEST_DATE:
            errors["graduation_date"] = "Enter a valid date."
        elif data.graduation_date > today:
            errors["graduation_date"] = "The graduation date cannot be in the future."
    expected = data.expected_completion_date
    if expected is not None and "expected_completion_date" not in errors:
        latest = today + timedelta(days=365 * EXPECTED_COMPLETION_YEARS_AHEAD)
        if expected < EARLIEST_DATE:
            errors["expected_completion_date"] = "Enter a valid date."
        elif expected > latest:
            errors["expected_completion_date"] = "The expected completion date is too far ahead."

    # Experiences.
    for index, experience in enumerate(data.experiences):
        prefix = f"experiences.{index}"
        if experience.start_date < EARLIEST_DATE:
            errors[f"{prefix}.start_date"] = "Enter a valid date."
        elif experience.start_date > today:
            errors[f"{prefix}.start_date"] = "The start date cannot be in the future."
        if experience.end_date is not None:
            if experience.end_date < experience.start_date:
                errors[f"{prefix}.end_date"] = "The end date cannot be before the start date."
            elif experience.end_date > today:
                errors[f"{prefix}.end_date"] = (
                    "The end date cannot be in the future. Leave it empty if you still work here."
                )

    # Ids must point at real rows (reference data is not guessable: the lists come from the API).
    if data.district_id not in _existing_ids(db, District, {data.district_id}):
        errors["district_id"] = "Choose a district from the list."
    if data.qualification_level_id not in _existing_ids(
        db, QualificationLevel, {data.qualification_level_id}
    ):
        errors["qualification_level_id"] = "Choose a qualification level from the list."
    if data.institution_id is not None and data.institution_id not in _usable_ids(
        db,
        Institution,
        {data.institution_id},
        {current.institution_id} if current and current.institution_id else set(),
    ):
        errors["institution_id"] = "Choose an institution from the list."
    if data.field_of_study_id is not None and data.field_of_study_id not in _usable_ids(
        db,
        FieldOfStudy,
        {data.field_of_study_id},
        {current.field_of_study_id} if current and current.field_of_study_id else set(),
    ):
        errors["field_of_study_id"] = "Choose a field of study from the list."
    wanted_skills = set(data.skill_ids)
    if wanted_skills - _usable_ids(db, Skill, wanted_skills, current_skill_ids):
        errors["skill_ids"] = "One or more skills are not available. Pick them from the list."

    return errors


# ---------- saving ----------


def _profile_values(data: ProfileIn) -> dict[str, object]:
    return {name: getattr(data, name) for name in _PROFILE_COLUMNS}


def upsert_my_profile(
    db: Session, user: User, data: ProfileIn, *, today: date | None = None
) -> ProfileView:
    """Create or replace the caller's profile, skills and experiences in one transaction.

    Everything is validated first; nothing is written if anything is wrong. The profile row is
    written with INSERT ... ON CONFLICT (user_id), so two simultaneous first saves cannot create
    two profiles.
    """
    current = _find_profile(db, user)
    current_skill_ids: set[uuid.UUID] = set()
    if current is not None:
        current_skill_ids = set(
            db.scalars(select(ProfileSkill.skill_id).where(ProfileSkill.profile_id == current.id))
        )

    errors = profile_errors(db, data, current, current_skill_ids, today or today_in_kampala())
    if errors:
        raise AppError(
            "validation_error", "Some fields are invalid.", status=422, details={"fields": errors}
        )

    values = _profile_values(data)
    statement = insert(SeekerProfile).values(user_id=user.id, **values)
    profile_id = db.execute(
        statement.on_conflict_do_update(
            index_elements=[SeekerProfile.user_id],
            set_={
                **{name: getattr(statement.excluded, name) for name in values},
                "updated_at": func.now(),
            },
        ).returning(SeekerProfile.id)
    ).scalar_one()

    # Skills: drop the ones no longer chosen, add the new ones.
    db.execute(
        delete(ProfileSkill).where(
            ProfileSkill.profile_id == profile_id, ProfileSkill.skill_id.not_in(data.skill_ids)
        )
    )
    if data.skill_ids:
        db.execute(
            insert(ProfileSkill)
            .values([{"profile_id": profile_id, "skill_id": s} for s in data.skill_ids])
            .on_conflict_do_nothing(index_elements=["profile_id", "skill_id"])
        )

    # Experiences: replaced as a whole.
    db.execute(delete(ProfileExperience).where(ProfileExperience.profile_id == profile_id))
    db.add_all(
        ProfileExperience(
            profile_id=profile_id,
            title=e.title,
            organisation=e.organisation,
            start_date=e.start_date,
            end_date=e.end_date,
            description=e.description,
        )
        for e in data.experiences
    )
    db.flush()

    profile = db.scalars(
        select(SeekerProfile)
        .where(SeekerProfile.id == profile_id)
        .execution_options(populate_existing=True)
    ).one()
    return _load_view(db, profile)

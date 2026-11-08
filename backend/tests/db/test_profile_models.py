"""The database enforces the profile rules itself, whatever the API does."""

from datetime import date
from typing import Any

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

from app.core.security import normalise_email
from app.models import (
    District,
    ProfileExperience,
    ProfileSkill,
    SeekerProfile,
    StudyStatus,
    User,
    UserRole,
)
from tests.api.profile_helpers import Refs, make_refs


@pytest.fixture
def refs(db_session: Session) -> Refs:
    return make_refs(db_session)


def make_user(db: Session, email: str = "nakato@example.com") -> User:
    user = User(email=email, email_normalized=normalise_email(email), role=UserRole.JOB_SEEKER)
    db.add(user)
    db.flush()
    return user


def make_profile(db: Session, refs: Refs, user: User, **overrides: Any) -> SeekerProfile:
    values: dict[str, Any] = {
        "user_id": user.id,
        "full_name": "Nakato Sarah",
        "institution_id": refs.institution.id,
        "qualification_level_id": refs.level.id,
        "study_status": StudyStatus.COMPLETED,
        "graduation_date": date(2025, 7, 15),
        "district_id": refs.district.id,
    }
    values.update(overrides)
    profile = SeekerProfile(**values)
    db.add(profile)
    db.flush()
    return profile


def violated(db: Session, refs: Refs, constraint: str, **overrides: Any) -> None:
    """Saving a profile with these values must break exactly this named constraint."""
    user = make_user(db)
    with pytest.raises(IntegrityError, match=constraint):
        make_profile(db, refs, user, **overrides)


def test_defaults(db_session: Session, refs: Refs) -> None:
    profile = make_profile(db_session, refs, make_user(db_session))
    db_session.refresh(profile)

    assert profile.is_discoverable is False
    assert profile.phone is None and profile.summary is None
    assert profile.created_at.tzinfo is not None


def test_one_profile_per_user(db_session: Session, refs: Refs) -> None:
    user = make_user(db_session)
    make_profile(db_session, refs, user)

    with pytest.raises(IntegrityError, match="uq_seeker_profiles_user_id"):
        make_profile(db_session, refs, user)


def test_an_institution_is_chosen_or_typed_never_both_never_neither(
    db_session: Session, refs: Refs
) -> None:
    user = make_user(db_session)

    for overrides in (
        {"institution_id": None, "institution_other_name": None},  # neither
        {"institution_other_name": "Some college"},  # both
    ):
        with pytest.raises(IntegrityError, match="ck_seeker_profiles_institution_or_other"):
            with db_session.begin_nested():
                make_profile(db_session, refs, user, **overrides)


def test_a_typed_institution_alone_is_fine(db_session: Session, refs: Refs) -> None:
    make_profile(
        db_session,
        refs,
        make_user(db_session),
        institution_id=None,
        institution_other_name="Kabale Hills Institute",
    )


def test_a_field_of_study_is_chosen_or_typed_not_both(db_session: Session, refs: Refs) -> None:
    violated(
        db_session,
        refs,
        "ck_seeker_profiles_field_of_study_or_other",
        field_of_study_id=refs.field_of_study.id,
        field_of_study_other="Beekeeping",
    )


@pytest.mark.parametrize(
    "overrides",
    [
        {"study_status": StudyStatus.STUDYING, "graduation_date": date(2025, 7, 15)},
        {
            "study_status": StudyStatus.COMPLETED,
            "graduation_date": None,
            "expected_completion_date": date(2027, 6, 30),
        },
    ],
    ids=["studying-with-graduation-date", "completed-with-expected-date"],
)
def test_study_status_and_dates_must_agree(
    db_session: Session, refs: Refs, overrides: dict[str, Any]
) -> None:
    violated(db_session, refs, "ck_seeker_profiles_study_status_dates", **overrides)


def test_blank_typed_names_are_refused(db_session: Session, refs: Refs) -> None:
    violated(
        db_session,
        refs,
        "ck_seeker_profiles_institution_other_not_blank",
        institution_id=None,
        institution_other_name="   ",
    )


def test_an_unknown_study_status_is_refused_even_with_raw_sql(
    db_session: Session, refs: Refs
) -> None:
    user = make_user(db_session)

    with pytest.raises(IntegrityError, match="ck_seeker_profiles_study_status"):
        db_session.execute(
            text(
                "INSERT INTO seeker_profiles (user_id, full_name, institution_id, "
                "qualification_level_id, study_status, district_id) "
                "VALUES (:u, 'X Y', :i, :q, 'paused', :d)"
            ),
            {
                "u": user.id,
                "i": refs.institution.id,
                "q": refs.level.id,
                "d": refs.district.id,
            },
        )


def test_the_summary_is_limited_by_the_database(db_session: Session, refs: Refs) -> None:
    user = make_user(db_session)

    with pytest.raises(DataError):
        make_profile(db_session, refs, user, summary="x" * 1001)


def test_an_experience_cannot_end_before_it_starts(db_session: Session, refs: Refs) -> None:
    profile = make_profile(db_session, refs, make_user(db_session))
    db_session.add(
        ProfileExperience(
            profile_id=profile.id,
            title="Clerk",
            organisation="Gulu Traders",
            start_date=date(2024, 6, 1),
            end_date=date(2024, 1, 1),
        )
    )

    with pytest.raises(IntegrityError, match="ck_profile_experiences_end_not_before_start"):
        db_session.flush()


def test_a_skill_can_be_on_a_profile_only_once(db_session: Session, refs: Refs) -> None:
    profile = make_profile(db_session, refs, make_user(db_session))
    python = refs.skills["Python"]
    db_session.add(ProfileSkill(profile_id=profile.id, skill_id=python.id))
    db_session.flush()

    with pytest.raises(IntegrityError, match="pk_profile_skills"):
        with db_session.begin_nested():
            db_session.add(ProfileSkill(profile_id=profile.id, skill_id=python.id))
            db_session.flush()


def test_deleting_a_user_removes_the_whole_profile(db_session: Session, refs: Refs) -> None:
    user = make_user(db_session)
    profile = make_profile(db_session, refs, user)
    db_session.add(ProfileSkill(profile_id=profile.id, skill_id=refs.skills["Python"].id))
    db_session.add(
        ProfileExperience(
            profile_id=profile.id,
            title="Clerk",
            organisation="Gulu Traders",
            start_date=date(2024, 1, 1),
        )
    )
    db_session.flush()

    db_session.execute(delete(User).where(User.id == user.id))

    for model in (SeekerProfile, ProfileSkill, ProfileExperience):
        assert db_session.scalar(select(func.count()).select_from(model)) == 0, model


def test_reference_rows_in_use_cannot_be_deleted(db_session: Session, refs: Refs) -> None:
    make_profile(db_session, refs, make_user(db_session))

    with pytest.raises(IntegrityError, match="fk_seeker_profiles_district_id_districts"):
        db_session.execute(delete(District).where(District.id == refs.district.id))


def test_a_skill_in_use_cannot_be_deleted(db_session: Session, refs: Refs) -> None:
    profile = make_profile(db_session, refs, make_user(db_session))
    python = refs.skills["Python"]
    db_session.add(ProfileSkill(profile_id=profile.id, skill_id=python.id))
    db_session.flush()

    with pytest.raises(IntegrityError, match="fk_profile_skills_skill_id_skills"):
        db_session.execute(text("DELETE FROM skills WHERE id = :id"), {"id": python.id})

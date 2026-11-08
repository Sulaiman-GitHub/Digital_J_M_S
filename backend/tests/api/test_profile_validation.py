"""Every validation rule of the profile, reported per field and all at once."""

from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import FieldOfStudy, Institution, SeekerProfile, Skill
from app.services.profiles import today_in_kampala
from tests.api.auth_helpers import register_and_login
from tests.api.profile_helpers import (
    PROFILE,
    Refs,
    experience,
    field_errors,
    make_refs,
    profile_payload,
    put_profile,
)

UNKNOWN_ID = "00000000-0000-0000-0000-00000000dead"


@pytest.fixture
def refs(db_session: Session) -> Refs:
    return make_refs(db_session)


@pytest.fixture
def seeker(client: TestClient) -> TestClient:
    register_and_login(client, "nakato@example.com")
    return client


def iso(days_from_today: int) -> str:
    return (today_in_kampala() + timedelta(days=days_from_today)).isoformat()


def profiles_saved(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(SeekerProfile)) or 0


# ---------- name, phone, summary ----------


@pytest.mark.parametrize("name", ["", "   ", "A", " B ", "x" * 151, "Nakato\x00Sarah", "Sarah\x07"])
def test_the_name_must_be_2_to_150_characters_without_control_characters(
    seeker: TestClient, refs: Refs, db_session: Session, name: str
) -> None:
    errors = field_errors(put_profile(seeker, profile_payload(refs, full_name=name)))

    assert "full_name" in errors
    assert profiles_saved(db_session) == 0


@pytest.mark.parametrize(
    "phone",
    [
        "0772123456",
        "0772 123 456",
        "+256 772 123456",
        "256772123456",
        "(0772) 123-456",
        "+256-772-123-456",
        " 0772.123.456 ",
        "+256772123456",
    ],
)
def test_ugandan_phone_numbers_are_normalised(seeker: TestClient, refs: Refs, phone: str) -> None:
    data = put_profile(seeker, profile_payload(refs, phone=phone)).json()["data"]

    assert data["phone"] == "+256772123456"


@pytest.mark.parametrize(
    "phone",
    ["12345", "0672123456", "+254772123456", "07721234", "077212345678", "abc", "+256 772 12345a"],
)
def test_other_phone_numbers_are_refused_with_a_helpful_message(
    seeker: TestClient, refs: Refs, phone: str
) -> None:
    errors = field_errors(put_profile(seeker, profile_payload(refs, phone=phone)))

    assert set(errors) == {"phone"}
    assert "Ugandan mobile number" in errors["phone"]
    assert not errors["phone"].startswith("Value error")  # a message a person can read


def test_the_summary_is_limited_to_1000_characters(seeker: TestClient, refs: Refs) -> None:
    ok = put_profile(seeker, profile_payload(refs, summary="x" * 1000))
    too_long = put_profile(seeker, profile_payload(refs, summary="x" * 1001))

    assert ok.status_code == 200
    assert "at most 1000" in field_errors(too_long)["summary"]


# ---------- institution and field of study ----------


def test_an_institution_is_required_either_chosen_or_typed(seeker: TestClient, refs: Refs) -> None:
    errors = field_errors(put_profile(seeker, profile_payload(refs, institution_id=None)))

    assert errors == {"institution_id": "Choose your institution, or type its name."}


def test_a_blank_typed_institution_counts_as_missing(seeker: TestClient, refs: Refs) -> None:
    payload = profile_payload(refs, institution_id=None, institution_other_name="   ")

    assert "institution_id" in field_errors(put_profile(seeker, payload))


def test_an_institution_cannot_be_both_chosen_and_typed(seeker: TestClient, refs: Refs) -> None:
    payload = profile_payload(refs, institution_other_name="Some other college")

    errors = field_errors(put_profile(seeker, payload))

    assert errors == {"institution_other_name": "Choose from the list or type a name, not both."}


def test_a_field_of_study_is_optional_but_not_both_chosen_and_typed(
    seeker: TestClient, refs: Refs
) -> None:
    neither = profile_payload(refs, field_of_study_id=None)
    typed = profile_payload(refs, field_of_study_id=None, field_of_study_other=" Beekeeping ")
    both = profile_payload(refs, field_of_study_other="Beekeeping")

    assert put_profile(seeker, neither).status_code == 200
    assert put_profile(seeker, typed).json()["data"]["field_of_study_other"] == "Beekeeping"
    assert "field_of_study_other" in field_errors(put_profile(seeker, both))


# ---------- study status and dates ----------


def test_a_student_still_studying_cannot_have_a_graduation_date(
    seeker: TestClient, refs: Refs
) -> None:
    payload = profile_payload(refs, study_status="studying", graduation_date="2025-07-15")

    errors = field_errors(put_profile(seeker, payload))

    assert errors == {"graduation_date": "Remove the graduation date while you are still studying."}


def test_a_graduate_cannot_have_an_expected_completion_date(seeker: TestClient, refs: Refs) -> None:
    payload = profile_payload(
        refs, study_status="completed", graduation_date=None, expected_completion_date=iso(200)
    )

    errors = field_errors(put_profile(seeker, payload))

    assert set(errors) == {"expected_completion_date"}


def test_the_dates_are_optional_for_both_statuses(seeker: TestClient, refs: Refs) -> None:
    assert put_profile(seeker, profile_payload(refs, graduation_date=None)).status_code == 200
    studying = profile_payload(refs, study_status="studying", graduation_date=None)
    assert put_profile(seeker, studying).status_code == 200


def test_the_study_status_must_be_one_of_the_two(seeker: TestClient, refs: Refs) -> None:
    errors = field_errors(put_profile(seeker, profile_payload(refs, study_status="dropped_out")))

    assert "study_status" in errors


@pytest.mark.parametrize(
    ("days", "message"),
    [(1, "cannot be in the future"), (400000, "cannot be in the future")],
)
def test_the_graduation_date_cannot_be_in_the_future(
    seeker: TestClient, refs: Refs, days: int, message: str
) -> None:
    errors = field_errors(put_profile(seeker, profile_payload(refs, graduation_date=iso(days))))

    assert message in errors["graduation_date"]


def test_today_is_an_acceptable_graduation_date(seeker: TestClient, refs: Refs) -> None:
    assert put_profile(seeker, profile_payload(refs, graduation_date=iso(0))).status_code == 200


def test_the_expected_completion_date_cannot_be_more_than_ten_years_ahead(
    seeker: TestClient, refs: Refs
) -> None:
    base = profile_payload(refs, study_status="studying", graduation_date=None)

    ok = put_profile(seeker, {**base, "expected_completion_date": iso(365 * 9)})
    far = put_profile(seeker, {**base, "expected_completion_date": iso(365 * 10 + 30)})

    assert ok.status_code == 200
    assert "too far ahead" in field_errors(far)["expected_completion_date"]


def test_very_old_dates_are_refused(seeker: TestClient, refs: Refs) -> None:
    errors = field_errors(put_profile(seeker, profile_payload(refs, graduation_date="1950-01-01")))

    assert errors == {"graduation_date": "Enter a valid date."}


def test_a_malformed_date_is_a_field_error(seeker: TestClient, refs: Refs) -> None:
    errors = field_errors(put_profile(seeker, profile_payload(refs, graduation_date="15/07/2025")))

    assert "graduation_date" in errors


# ---------- skills and experiences ----------


def test_up_to_30_skills_are_allowed_and_31_are_not(
    seeker: TestClient, refs: Refs, db_session: Session
) -> None:
    db_session.add_all(
        [Skill(name=f"Skill {n:02d}", name_normalized=f"skill {n:02d}") for n in range(40)]
    )
    db_session.flush()
    ids = [str(i) for i in db_session.scalars(select(Skill.id).order_by(Skill.name_normalized))]

    ok = put_profile(seeker, profile_payload(refs, skill_ids=ids[:30]))
    too_many = put_profile(seeker, profile_payload(refs, skill_ids=ids[:31]))

    assert ok.status_code == 200 and len(ok.json()["data"]["skills"]) == 30
    assert field_errors(too_many) == {"skill_ids": "Choose at most 30 skills."}


def test_repeated_ids_do_not_count_towards_the_skill_limit(seeker: TestClient, refs: Refs) -> None:
    one = str(refs.skills["Python"].id)

    assert put_profile(seeker, profile_payload(refs, skill_ids=[one] * 45)).status_code == 200


def test_an_unknown_skill_is_refused_and_nothing_is_saved(
    seeker: TestClient, refs: Refs, db_session: Session
) -> None:
    payload = profile_payload(refs, skill_ids=[str(refs.skills["Python"].id), UNKNOWN_ID])

    errors = field_errors(put_profile(seeker, payload))

    assert "skill_ids" in errors
    assert profiles_saved(db_session) == 0


def test_a_skill_id_that_is_not_a_uuid_is_a_field_error(seeker: TestClient, refs: Refs) -> None:
    assert "skill_ids.0" in field_errors(
        put_profile(seeker, profile_payload(refs, skill_ids=["x"]))
    )


def test_an_inactive_skill_cannot_be_added_but_stays_if_already_chosen(
    seeker: TestClient, refs: Refs, db_session: Session
) -> None:
    python, excel = refs.skills["Python"], refs.skills["Excel"]
    put_profile(seeker, profile_payload(refs, skill_ids=[str(python.id)]))
    db_session.execute(
        update(Skill).where(Skill.id.in_([python.id, excel.id])).values(is_active=False)
    )

    adding = put_profile(seeker, profile_payload(refs, skill_ids=[str(python.id), str(excel.id)]))
    keeping = put_profile(seeker, profile_payload(refs, skill_ids=[str(python.id)]))

    assert "skill_ids" in field_errors(adding)  # Excel is new and inactive
    assert keeping.status_code == 200  # Python was already on the profile
    assert [s["name"] for s in keeping.json()["data"]["skills"]] == ["Python"]


def test_up_to_10_experiences_are_allowed_and_11_are_not(seeker: TestClient, refs: Refs) -> None:
    ten = [experience(title=f"Role {n}") for n in range(10)]

    ok = put_profile(seeker, profile_payload(refs, experiences=ten))
    too_many = put_profile(seeker, profile_payload(refs, experiences=[*ten, experience()]))

    assert ok.status_code == 200 and len(ok.json()["data"]["experiences"]) == 10
    assert field_errors(too_many) == {"experiences": "Add at most 10 experiences."}


def test_an_experience_needs_a_title_an_organisation_and_a_start_date(
    seeker: TestClient, refs: Refs
) -> None:
    payload = profile_payload(
        refs, experiences=[{"title": " ", "organisation": "", "description": "x"}]
    )

    errors = field_errors(put_profile(seeker, payload))

    assert set(errors) == {
        "experiences.0.title",
        "experiences.0.organisation",
        "experiences.0.start_date",
    }


def test_an_experience_cannot_end_before_it_starts(seeker: TestClient, refs: Refs) -> None:
    bad = experience(start_date="2024-06-01", end_date="2024-01-01")

    errors = field_errors(
        put_profile(seeker, profile_payload(refs, experiences=[experience(), bad]))
    )

    assert errors == {"experiences.1.end_date": "The end date cannot be before the start date."}


def test_an_experience_can_start_and_end_on_the_same_day_or_be_current(
    seeker: TestClient, refs: Refs
) -> None:
    same_day = experience(start_date="2024-06-01", end_date="2024-06-01")
    current = experience(title="Now", start_date="2025-01-01", end_date=None)

    assert (
        put_profile(seeker, profile_payload(refs, experiences=[same_day, current])).status_code
        == 200
    )


def test_experience_dates_cannot_be_in_the_future(seeker: TestClient, refs: Refs) -> None:
    future_start = experience(start_date=iso(5), end_date=None)
    future_end = experience(start_date="2024-01-01", end_date=iso(5))

    errors = field_errors(
        put_profile(seeker, profile_payload(refs, experiences=[future_start, future_end]))
    )

    assert set(errors) == {"experiences.0.start_date", "experiences.1.end_date"}


def test_an_experience_description_is_limited_to_1000_characters(
    seeker: TestClient, refs: Refs
) -> None:
    ok = put_profile(
        seeker, profile_payload(refs, experiences=[experience(description="x" * 1000)])
    )
    long = put_profile(
        seeker, profile_payload(refs, experiences=[experience(description="x" * 1001)])
    )

    assert ok.status_code == 200
    assert "at most 1000" in field_errors(long)["experiences.0.description"]


# ---------- ids must be real ----------


@pytest.mark.parametrize(
    "field",
    ["district_id", "qualification_level_id", "institution_id", "field_of_study_id"],
)
def test_unknown_reference_ids_are_refused(seeker: TestClient, refs: Refs, field: str) -> None:
    errors = field_errors(put_profile(seeker, profile_payload(refs, **{field: UNKNOWN_ID})))

    assert set(errors) == {field}
    assert "from the list" in errors[field]


@pytest.mark.parametrize("field", ["district_id", "qualification_level_id"])
def test_district_and_qualification_level_are_required(
    seeker: TestClient, refs: Refs, field: str
) -> None:
    payload = profile_payload(refs)
    del payload[field]

    assert field in field_errors(put_profile(seeker, payload))


def test_an_inactive_institution_cannot_be_newly_chosen_but_an_existing_choice_is_kept(
    seeker: TestClient, refs: Refs, db_session: Session
) -> None:
    other = Institution(name="Lira University", institution_type=refs.institution.institution_type)
    db_session.add(other)
    db_session.flush()
    put_profile(seeker, profile_payload(refs))  # chose Gulu University
    db_session.execute(update(Institution).values(is_active=False))
    db_session.execute(update(FieldOfStudy).values(is_active=False))

    new_choice = put_profile(seeker, profile_payload(refs, institution_id=str(other.id)))
    same_choice = put_profile(seeker, profile_payload(refs, full_name="Nakato Sarah Mary"))

    assert "institution_id" in field_errors(new_choice)
    assert same_choice.status_code == 200  # the user can still save other changes
    assert same_choice.json()["data"]["institution_id"] == str(refs.institution.id)


# ---------- the form reports every problem at once ----------


def test_all_problems_come_back_together(seeker: TestClient, refs: Refs) -> None:
    payload = profile_payload(
        refs,
        study_status="studying",
        graduation_date="2025-07-15",
        institution_id=None,
        district_id=UNKNOWN_ID,
        skill_ids=[UNKNOWN_ID],
        experiences=[experience(start_date="2024-06-01", end_date="2024-01-01")],
    )

    errors = field_errors(put_profile(seeker, payload))

    assert set(errors) == {
        "graduation_date",
        "institution_id",
        "district_id",
        "skill_ids",
        "experiences.0.end_date",
    }


def test_errors_use_the_error_format_and_never_echo_server_internals(
    seeker: TestClient, refs: Refs
) -> None:
    response = put_profile(seeker, profile_payload(refs, district_id=UNKNOWN_ID))

    body: dict[str, Any] = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert "Traceback" not in response.text and "psycopg" not in response.text


def test_missing_required_fields_are_field_errors(seeker: TestClient) -> None:
    response = seeker.put(PROFILE, json={}, headers=_csrf(seeker))

    assert set(field_errors(response)) == {
        "full_name",
        "qualification_level_id",
        "study_status",
        "district_id",
    }


def _csrf(client: TestClient) -> dict[str, str]:
    from tests.api.auth_helpers import csrf_headers

    return csrf_headers(client)


def test_today_is_taken_in_kampala_time() -> None:
    from datetime import UTC, datetime
    from zoneinfo import ZoneInfo

    assert today_in_kampala() == datetime.now(UTC).astimezone(ZoneInfo("Africa/Kampala")).date()
    assert isinstance(today_in_kampala(), date)

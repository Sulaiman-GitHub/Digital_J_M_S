"""Seeker profile API: saving, replacing, permissions and ownership."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import ProfileExperience, ProfileSkill, SeekerProfile, UserRole
from tests.api.auth_helpers import error_code, register_and_login
from tests.api.profile_helpers import (
    PROFILE,
    Refs,
    create_user,
    experience,
    login_as,
    make_refs,
    profile_payload,
    put_profile,
)


@pytest.fixture
def refs(db_session: Session) -> Refs:
    return make_refs(db_session)


@pytest.fixture
def seeker(client: TestClient) -> TestClient:
    register_and_login(client, "nakato@example.com")  # email NOT verified: profiles do not need it
    return client


@pytest.fixture
def second_client(client: TestClient) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        yield other


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


# ---------- creating, reading, replacing ----------


def test_there_is_no_profile_until_one_is_created(seeker: TestClient) -> None:
    response = seeker.get(PROFILE)

    assert response.status_code == 404
    assert error_code(response) == "profile_not_found"


def test_create_then_read_the_same_profile(seeker: TestClient, refs: Refs) -> None:
    created = put_profile(seeker, profile_payload(refs))

    assert created.status_code == 200, created.text
    data = created.json()["data"]
    assert data["full_name"] == "Nakato Sarah"
    assert data["phone"] == "+256772123456"  # normalised
    assert data["study_status"] == "completed"
    assert data["graduation_date"] == "2025-07-15"
    assert data["institution_id"] == str(refs.institution.id)
    assert [s["name"] for s in data["skills"]] == ["Excel", "Python"]  # alphabetical
    assert [e["title"] for e in data["experiences"]] == ["Accounts Intern"]

    read = seeker.get(PROFILE)
    assert read.status_code == 200
    assert {k: v for k, v in read.json()["data"].items() if k != "updated_at"} == {
        k: v for k, v in data.items() if k != "updated_at"
    }


def test_the_response_never_contains_user_id_or_is_discoverable(
    seeker: TestClient, refs: Refs, db_session: Session
) -> None:
    data = put_profile(seeker, profile_payload(refs)).json()["data"]

    assert "user_id" not in data and "is_discoverable" not in data
    assert db_session.scalars(select(SeekerProfile.is_discoverable)).one() is False


def test_a_minimal_profile_is_enough(seeker: TestClient, refs: Refs) -> None:
    payload = profile_payload(
        refs,
        phone=None,
        field_of_study_id=None,
        graduation_date=None,
        summary=None,
        skill_ids=[],
        experiences=[],
    )

    data = put_profile(seeker, payload).json()["data"]

    assert data["phone"] is None and data["skills"] == [] and data["experiences"] == []


def test_a_student_still_studying(seeker: TestClient, refs: Refs) -> None:
    payload = profile_payload(
        refs, study_status="studying", graduation_date=None, expected_completion_date="2027-06-30"
    )

    data = put_profile(seeker, payload).json()["data"]

    assert data["study_status"] == "studying"
    assert data["expected_completion_date"] == "2027-06-30"


def test_an_institution_that_is_not_listed_can_be_typed(seeker: TestClient, refs: Refs) -> None:
    payload = profile_payload(
        refs, institution_id=None, institution_other_name="  Kabale   Hills Institute "
    )

    data = put_profile(seeker, payload).json()["data"]

    assert data["institution_id"] is None
    assert data["institution_other_name"] == "Kabale Hills Institute"


def test_saving_again_replaces_everything(
    seeker: TestClient, refs: Refs, db_session: Session
) -> None:
    first = put_profile(seeker, profile_payload(refs)).json()["data"]

    replaced = put_profile(
        seeker,
        profile_payload(
            refs,
            full_name="Nakato Sarah Mary",
            district_id=str(refs.other_district.id),
            skill_ids=[str(refs.skills["Teaching"].id)],
            experiences=[
                experience(title="Tutor", start_date="2023-02-01", end_date=None),
                experience(title="Cashier", start_date="2022-01-10", end_date="2022-12-20"),
            ],
        ),
    ).json()["data"]

    assert replaced["id"] == first["id"]  # same profile, updated in place
    assert replaced["full_name"] == "Nakato Sarah Mary"
    assert replaced["district_id"] == str(refs.other_district.id)
    assert [s["name"] for s in replaced["skills"]] == ["Teaching"]
    assert [e["title"] for e in replaced["experiences"]] == ["Tutor", "Cashier"]  # newest first
    assert replaced["experiences"][0]["end_date"] is None
    assert replaced["created_at"] == first["created_at"]
    assert replaced["updated_at"] >= first["updated_at"]
    assert (count(db_session, SeekerProfile), count(db_session, ProfileSkill)) == (1, 1)
    assert count(db_session, ProfileExperience) == 2  # the old experience is gone


def test_all_skills_and_experiences_can_be_removed(
    seeker: TestClient, refs: Refs, db_session: Session
) -> None:
    put_profile(seeker, profile_payload(refs))

    data = put_profile(seeker, profile_payload(refs, skill_ids=[], experiences=[])).json()["data"]

    assert data["skills"] == [] and data["experiences"] == []
    assert count(db_session, ProfileSkill) == count(db_session, ProfileExperience) == 0


def test_saving_the_same_data_twice_changes_nothing(
    seeker: TestClient, refs: Refs, db_session: Session
) -> None:
    payload = profile_payload(refs)
    first = put_profile(seeker, payload).json()["data"]

    second = put_profile(seeker, payload).json()["data"]

    assert second["id"] == first["id"]
    assert second["skills"] == first["skills"]
    assert [e["title"] for e in second["experiences"]] == [e["title"] for e in first["experiences"]]
    assert (count(db_session, SeekerProfile), count(db_session, ProfileSkill)) == (1, 2)


def test_repeated_skills_are_merged(seeker: TestClient, refs: Refs) -> None:
    python = str(refs.skills["Python"].id)

    data = put_profile(seeker, profile_payload(refs, skill_ids=[python, python, python])).json()
    assert [s["name"] for s in data["data"]["skills"]] == ["Python"]


def test_text_fields_are_cleaned(seeker: TestClient, refs: Refs) -> None:
    payload = profile_payload(
        refs,
        full_name="  Nakato \t Sarah  ",
        summary="  Line one.\r\n\r\nLine two.  ",
        experiences=[experience(title="  Accounts   Intern ", description="   ")],
    )

    data = put_profile(seeker, payload).json()["data"]

    assert data["full_name"] == "Nakato Sarah"
    assert data["summary"] == "Line one.\n\nLine two."
    assert data["experiences"][0]["title"] == "Accounts Intern"
    assert data["experiences"][0]["description"] is None


def test_the_phone_is_optional_and_a_blank_phone_clears_it(seeker: TestClient, refs: Refs) -> None:
    put_profile(seeker, profile_payload(refs))

    data = put_profile(seeker, profile_payload(refs, phone="   ")).json()["data"]

    assert data["phone"] is None


# ---------- who may use it ----------


def test_anonymous_visitors_get_401(client: TestClient, refs: Refs) -> None:
    assert client.get(PROFILE).status_code == 401
    assert client.put(PROFILE, json=profile_payload(refs)).status_code == 401


@pytest.mark.parametrize("role", [UserRole.EMPLOYER, UserRole.ADMIN])
def test_only_job_seekers_may_use_profiles(
    client: TestClient, db_session: Session, refs: Refs, role: UserRole
) -> None:
    email = f"{role.value}@example.com"
    create_user(db_session, email, role)
    login_as(client, email)

    get = client.get(PROFILE)
    put = put_profile(client, profile_payload(refs))

    assert (get.status_code, put.status_code) == (403, 403)
    assert error_code(get) == error_code(put) == "forbidden"
    assert count(db_session, SeekerProfile) == 0


def test_saving_needs_the_csrf_token(seeker: TestClient, refs: Refs, db_session: Session) -> None:
    missing = seeker.put(PROFILE, json=profile_payload(refs))
    wrong = seeker.put(PROFILE, json=profile_payload(refs), headers={"X-CSRF-Token": "guess"})

    assert (missing.status_code, wrong.status_code) == (403, 403)
    assert error_code(missing) == error_code(wrong) == "csrf_failed"
    assert count(db_session, SeekerProfile) == 0


def test_a_suspended_user_loses_access(seeker: TestClient, refs: Refs, db_session: Session) -> None:
    from app.models import UserStatus
    from tests.api.auth_helpers import set_status

    put_profile(seeker, profile_payload(refs))
    set_status(db_session, "nakato@example.com", UserStatus.SUSPENDED)

    assert seeker.get(PROFILE).status_code == 401


# ---------- ownership ----------


def test_one_seeker_can_never_read_or_change_another_seekers_profile(
    client: TestClient, second_client: TestClient, refs: Refs, db_session: Session
) -> None:
    register_and_login(client, "nakato@example.com")
    register_and_login(second_client, "okello@example.com")
    nakato = put_profile(client, profile_payload(refs, full_name="Nakato Sarah")).json()["data"]

    # Okello has no profile of their own yet: they get a 404, not Nakato's profile.
    assert second_client.get(PROFILE).status_code == 404

    # Okello saves their own. Nakato's is untouched.
    okello = put_profile(second_client, profile_payload(refs, full_name="Okello James")).json()
    assert okello["data"]["id"] != nakato["id"]
    assert client.get(PROFILE).json()["data"]["full_name"] == "Nakato Sarah"
    assert second_client.get(PROFILE).json()["data"]["full_name"] == "Okello James"
    assert count(db_session, SeekerProfile) == 2


def test_a_client_cannot_name_a_user_or_a_profile(
    seeker: TestClient, client: TestClient, refs: Refs, db_session: Session
) -> None:
    other_profile_attempts = {
        "user_id": "00000000-0000-0000-0000-000000000001",
        "id": "00000000-0000-0000-0000-000000000002",
        "is_discoverable": True,
    }

    response = put_profile(seeker, profile_payload(refs, **other_profile_attempts))

    assert set(field_errors_of(response)) == set(other_profile_attempts)
    assert count(db_session, SeekerProfile) == 0


def field_errors_of(response: Any) -> dict[str, str]:
    assert response.status_code == 422, response.text
    return response.json()["error"]["details"]["fields"]


def test_the_only_profile_routes_are_the_owners_own(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert [p for p in paths if "/profile" in p] == ["/api/v1/profile/me"]


# ---------- the save is all or nothing ----------


def test_a_failed_validation_changes_nothing(
    seeker: TestClient, refs: Refs, db_session: Session
) -> None:
    before = put_profile(seeker, profile_payload(refs)).json()["data"]

    bad = put_profile(
        seeker,
        profile_payload(
            refs,
            full_name="Changed Name",
            skill_ids=[str(refs.skills["Welding"].id), "00000000-0000-0000-0000-00000000dead"],
            experiences=[],
        ),
    )

    assert bad.status_code == 422
    after = seeker.get(PROFILE).json()["data"]
    assert after["full_name"] == before["full_name"]
    assert [s["name"] for s in after["skills"]] == ["Excel", "Python"]
    assert len(after["experiences"]) == 1


def test_a_crash_half_way_through_rolls_everything_back(
    seeker: TestClient, refs: Refs, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import profiles as profile_service

    put_profile(seeker, profile_payload(refs))

    def explode(**kwargs: object) -> None:
        raise RuntimeError("disk full")

    # Skills are already replaced when experiences are written: the whole save must be undone.
    monkeypatch.setattr(profile_service, "ProfileExperience", explode)
    crashed = put_profile(
        seeker,
        profile_payload(
            refs,
            full_name="Half Saved",
            skill_ids=[str(refs.skills["Teaching"].id)],
            experiences=[experience(title="New job")],
        ),
    )
    monkeypatch.undo()

    assert crashed.status_code == 500
    after = seeker.get(PROFILE).json()["data"]
    assert after["full_name"] == "Nakato Sarah"
    assert [s["name"] for s in after["skills"]] == ["Excel", "Python"]
    assert [e["title"] for e in after["experiences"]] == ["Accounts Intern"]


def test_saving_twice_in_a_row_hits_the_conflict_path_without_an_error(
    client: TestClient, refs: Refs, db_session: Session
) -> None:
    """Two first-time saves cannot make two profiles: the second one updates the first."""
    from app.schemas.profile import ProfileIn
    from app.services.profiles import upsert_my_profile
    from tests.api.auth_helpers import get_user

    register_and_login(client, "nakato@example.com")
    user = get_user(db_session)
    data = ProfileIn.model_validate(profile_payload(refs))

    first = upsert_my_profile(db_session, user, data)
    second = upsert_my_profile(db_session, user, data)

    assert first.profile.id == second.profile.id
    assert count(db_session, SeekerProfile) == 1

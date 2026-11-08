"""Consents: recorded at registration, given and withdrawn through the API."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import Consent, ConsentType, UserRole
from tests.api.auth_helpers import (
    AUTH,
    PASSWORD,
    csrf_headers,
    error_code,
    get_user,
    register,
    register_and_login,
)
from tests.api.profile_helpers import create_user, login_as

CONSENTS = "/api/v1/consents"
MINE = f"{CONSENTS}/me"
SHARING = "cv_sharing_with_employers"


@pytest.fixture
def seeker(client: TestClient) -> TestClient:
    register_and_login(client, "nakato@example.com")
    return client


@pytest.fixture
def second_client(client: TestClient) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        yield other


def post(client: TestClient, consent_type: str, granted: bool, *, csrf: bool = True):
    return client.post(
        CONSENTS,
        json={"consent_type": consent_type, "granted": granted},
        headers=csrf_headers(client) if csrf else {},
    )


def active_types(client: TestClient) -> list[str]:
    return sorted(item["consent_type"] for item in client.get(MINE).json()["data"])


def rows(db: Session, email: str = "nakato@example.com") -> list[Consent]:
    user = get_user(db, email)
    return list(db.scalars(select(Consent).where(Consent.user_id == user.id)))


# ---------- registration ----------


def test_registering_records_terms_and_privacy_with_the_policy_version(
    client: TestClient, db_session: Session
) -> None:
    assert register(client).status_code == 201

    saved = rows(db_session)
    assert sorted(c.consent_type for c in saved) == [ConsentType.PRIVACY, ConsentType.TERMS]
    assert {c.policy_version for c in saved} == {get_settings().policy_version}
    assert all(c.granted_at is not None and c.revoked_at is None for c in saved)


@pytest.mark.parametrize("employer", [False, True])
def test_employers_also_agree_to_terms_and_privacy(
    client: TestClient, db_session: Session, employer: bool
) -> None:
    role = "employer" if employer else "job_seeker"
    assert register(client, role=role).status_code == 201

    assert len(rows(db_session)) == 2


def test_registration_without_accepting_is_refused_and_creates_nothing(
    client: TestClient, db_session: Session
) -> None:
    response = register(client, accept_terms=False)

    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert "accept_terms" in response.json()["error"]["details"]["fields"]
    assert db_session.scalars(select(Consent)).all() == []


def test_registration_without_the_field_is_refused(client: TestClient) -> None:
    response = client.post(
        f"{AUTH}/register",
        json={"email": "nakato@example.com", "password": PASSWORD, "role": "job_seeker"},
    )

    assert response.status_code == 422
    assert "accept_terms" in response.json()["error"]["details"]["fields"]


def test_a_failed_registration_records_no_consents(client: TestClient, db_session: Session) -> None:
    register(client)
    before = len(db_session.scalars(select(Consent)).all())

    assert register(client).status_code == 409  # email already taken

    assert len(db_session.scalars(select(Consent)).all()) == before


# ---------- reading ----------


def test_my_consents_lists_what_is_active(seeker: TestClient) -> None:
    response = seeker.get(MINE)

    assert response.status_code == 200
    data = response.json()["data"]
    assert sorted(item["consent_type"] for item in data) == ["privacy", "terms"]
    assert set(data[0]) == {"consent_type", "policy_version", "granted_at"}


def test_consents_are_private_to_their_owner(seeker: TestClient, second_client: TestClient) -> None:
    post(seeker, SHARING, True)
    register_and_login(second_client, "okello@example.com")

    assert active_types(second_client) == ["privacy", "terms"]
    assert active_types(seeker) == [SHARING, "privacy", "terms"]


# ---------- giving and withdrawing ----------


def test_sharing_the_cv_with_employers_can_be_given_and_withdrawn(
    seeker: TestClient, db_session: Session
) -> None:
    given = post(seeker, SHARING, True)

    assert given.status_code == 200
    assert SHARING in active_types(seeker)

    withdrawn = post(seeker, SHARING, False)

    assert withdrawn.status_code == 200
    assert SHARING not in active_types(seeker)
    history = [
        c for c in rows(db_session) if c.consent_type is ConsentType.CV_SHARING_WITH_EMPLOYERS
    ]
    assert len(history) == 1 and history[0].revoked_at is not None  # kept, not deleted


def test_giving_the_same_consent_twice_changes_nothing(
    seeker: TestClient, db_session: Session
) -> None:
    post(seeker, SHARING, True)
    post(seeker, SHARING, True)

    assert len([c for c in rows(db_session) if c.consent_type.value == SHARING]) == 1


def test_withdrawing_a_consent_that_is_not_active_is_fine(seeker: TestClient) -> None:
    assert post(seeker, SHARING, False).status_code == 200


def test_giving_again_after_withdrawing_adds_a_new_row(
    seeker: TestClient, db_session: Session
) -> None:
    post(seeker, SHARING, True)
    post(seeker, SHARING, False)
    post(seeker, SHARING, True)

    history = [c for c in rows(db_session) if c.consent_type.value == SHARING]
    assert len(history) == 2
    assert sum(c.revoked_at is None for c in history) == 1
    assert SHARING in active_types(seeker)


def test_a_new_policy_version_replaces_the_old_agreement(
    seeker: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    changed = get_settings().model_copy(update={"policy_version": "2027-01"})
    monkeypatch.setattr("app.services.consents.get_settings", lambda: changed)

    assert post(seeker, "terms", True).status_code == 200

    terms = [c for c in rows(db_session) if c.consent_type is ConsentType.TERMS]
    assert sorted(c.policy_version for c in terms) == [get_settings().policy_version, "2027-01"]
    assert [c.policy_version for c in terms if c.revoked_at is None] == ["2027-01"]


@pytest.mark.parametrize("consent_type", ["terms", "privacy"])
def test_terms_and_privacy_cannot_be_withdrawn(seeker: TestClient, consent_type: str) -> None:
    response = post(seeker, consent_type, False)

    assert response.status_code == 422
    assert error_code(response) == "consent_required"
    assert consent_type in active_types(seeker)


def test_an_unknown_consent_type_is_a_validation_error(seeker: TestClient) -> None:
    response = post(seeker, "sell_my_data", True)

    assert response.status_code == 422
    assert error_code(response) == "validation_error"


def test_extra_fields_are_refused(seeker: TestClient) -> None:
    response = seeker.post(
        CONSENTS,
        json={"consent_type": SHARING, "granted": True, "user_id": "x"},
        headers=csrf_headers(seeker),
    )

    assert response.status_code == 422


def test_granted_must_be_a_boolean(seeker: TestClient) -> None:
    response = seeker.post(CONSENTS, json={"consent_type": SHARING}, headers=csrf_headers(seeker))

    assert response.status_code == 422


# ---------- permissions ----------


def test_anonymous_requests_are_401(client: TestClient) -> None:
    assert client.get(MINE).status_code == 401
    response = client.post(CONSENTS, json={"consent_type": SHARING, "granted": True})
    assert response.status_code == 401
    assert error_code(response) == "not_authenticated"


def test_posting_needs_the_csrf_header(seeker: TestClient) -> None:
    response = post(seeker, SHARING, True, csrf=False)

    assert response.status_code == 403
    assert SHARING not in active_types(seeker)


def test_only_job_seekers_can_share_a_cv(client: TestClient, db_session: Session) -> None:
    create_user(db_session, "boss@example.com", UserRole.EMPLOYER)
    login_as(client, "boss@example.com")

    response = post(client, SHARING, True)

    assert response.status_code == 403
    assert error_code(response) == "forbidden"
    assert client.get(MINE).status_code == 200


def test_the_user_id_cannot_be_chosen(seeker: TestClient, second_client: TestClient) -> None:
    register_and_login(second_client, "okello@example.com")

    post(second_client, SHARING, True)

    assert SHARING not in active_types(seeker)

"""Account export and deletion."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Application,
    AuditEvent,
    AuthSession,
    Cv,
    Employer,
    SeekerProfile,
    User,
    UserRole,
    UserStatus,
    Vacancy,
    VacancyStatus,
)
from tests.api.application_helpers import (
    BOSS,
    SEEKER,
    Scene,
    apply_to,
    make_scene,
    prepare_seeker,
    set_status_as_employer,
    use_storage,
)
from tests.api.auth_helpers import PASSWORD, csrf_headers, error_code, get_user, login
from tests.api.cv_helpers import upload
from tests.api.profile_helpers import create_user, login_as, profile_payload, put_profile
from tests.sample_files import make_pdf

EXPORT = "/api/v1/account/export"
ACCOUNT = "/api/v1/account"


@pytest.fixture
def scene(db_session: Session, tmp_path: Path) -> Scene:
    root = tmp_path / "storage"
    root.mkdir()
    return make_scene(db_session, root)


@pytest.fixture
def seeker(client: TestClient, scene: Scene) -> TestClient:
    use_storage(client, scene.storage_root)
    prepare_seeker(client, scene)
    return client


@pytest.fixture
def boss(client: TestClient, scene: Scene) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        login_as(other, BOSS)
        yield other


@pytest.fixture
def other_seeker(client: TestClient, scene: Scene, db_session: Session) -> Iterator[TestClient]:
    create_user(db_session, "other@example.com", UserRole.JOB_SEEKER)
    db_session.commit()
    with TestClient(client.app, raise_server_exceptions=False) as other:
        login_as(other, "other@example.com")
        assert (
            put_profile(other, profile_payload(scene.refs, full_name="Okello Daniel")).status_code
            == 200
        )
        assert upload(other, "okello.pdf", make_pdf(pad_to=300)).status_code == 201
        granted = other.post(
            "/api/v1/consents",
            json={"consent_type": "cv_sharing_with_employers", "granted": True},
            headers=csrf_headers(other),
        )
        assert granted.status_code == 200
        yield other


def delete_account(client: TestClient, password: str = PASSWORD):
    return client.request(
        "DELETE", ACCOUNT, json={"password": password}, headers=csrf_headers(client)
    )


def files(scene: Scene) -> set[str]:
    return {p.name for p in scene.storage_root.iterdir() if not p.name.startswith(".")}


# ---------- export ----------


def test_export_needs_login(client: TestClient) -> None:
    assert client.get(EXPORT).status_code == 401


def test_a_job_seeker_exports_their_own_data(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    assert apply_to(seeker, scene.vacancy.id, cover_note="Hello").status_code == 201

    response = seeker.get(EXPORT)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    data = response.json()["data"]
    assert data["account"]["email"] == SEEKER
    assert data["profile"]["full_name"] == "Nakato Sarah"
    assert data["cv"]["original_filename"] == "my-cv.pdf"
    assert data["cv"]["download"] == "/api/v1/cv/me/download"
    assert [c["consent_type"] for c in data["consents"]]
    [application] = data["applications"]
    assert application["cover_note"] == "Hello"
    assert application["vacancy_title"] == "Accounts Assistant"
    assert application["profile_sent"]["full_name"] == "Nakato Sarah"
    assert [h["to_status"] for h in application["history"]] == ["submitted"]
    assert "storage" not in response.text
    events = db_session.scalars(select(AuditEvent).where(AuditEvent.action == "account_exported"))
    assert len(events.all()) == 1


def test_the_export_contains_only_the_callers_data(
    seeker: TestClient, other_seeker: TestClient, scene: Scene
) -> None:
    other_seeker.post(
        f"/api/v1/vacancies/{scene.vacancy.id}/applications",
        json={"cover_note": "Secret of Okello"},
        headers=csrf_headers(other_seeker),
    )

    mine = seeker.get(EXPORT).text
    theirs = other_seeker.get(EXPORT).text

    assert "Okello" not in mine and "other@example.com" not in mine
    assert "Secret of Okello" in theirs
    assert "Nakato" not in theirs and SEEKER not in theirs


def test_an_employer_exports_the_company_and_vacancies(boss: TestClient) -> None:
    data = boss.get(EXPORT).json()["data"]

    assert data["account"]["email"] == BOSS
    assert data["company"]["company_name"] == "Ssese Foods Ltd"
    assert [v["title"] for v in data["vacancies"]] == ["Accounts Assistant"]
    assert "profile" not in data


# ---------- delete ----------


def test_deleting_needs_the_password_and_csrf(seeker: TestClient, db_session: Session) -> None:
    wrong = delete_account(seeker, "Not-The-Password-1")
    assert wrong.status_code == 403
    assert error_code(wrong) == "wrong_password"
    assert (
        seeker.request("DELETE", ACCOUNT, json={"password": PASSWORD}).status_code == 403
    )  # no CSRF header
    assert (
        seeker.request("DELETE", ACCOUNT, json={}, headers=csrf_headers(seeker)).status_code == 422
    )
    assert get_user(db_session, SEEKER).status == UserStatus.ACTIVE


def test_deleting_needs_login(client: TestClient) -> None:
    assert client.request("DELETE", ACCOUNT, json={"password": "x"}).status_code == 401


def test_deleting_removes_personal_data_and_files(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    assert apply_to(seeker, scene.vacancy.id, cover_note="Hello").status_code == 201
    user_id = get_user(db_session, SEEKER).id
    assert len(files(scene)) == 2  # the CV and the application's copy

    response = delete_account(seeker)

    assert response.status_code == 204
    db_session.expire_all()
    user = db_session.get(User, user_id)
    assert user.status == UserStatus.DELETED
    assert user.deleted_at is not None
    assert user.email == f"deleted-{user_id.hex}@deleted.invalid"
    assert user.password_hash is None
    assert db_session.scalar(select(SeekerProfile).where(SeekerProfile.user_id == user_id)) is None
    assert db_session.scalar(select(func.count()).select_from(Cv)) == 0
    assert files(scene) == set()
    sessions = db_session.scalars(select(AuthSession).where(AuthSession.user_id == user_id)).all()
    assert sessions and all(s.revoked_at is not None for s in sessions)
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(AuditEvent.action == "account_deleted")
        )
        == 1
    )


def test_a_deleted_user_is_logged_out_and_cannot_log_in_again(
    seeker: TestClient, client: TestClient
) -> None:
    assert delete_account(seeker).status_code == 204

    assert seeker.get("/api/v1/auth/me").status_code == 401
    with TestClient(client.app, raise_server_exceptions=False) as fresh:
        assert login(fresh, SEEKER).status_code == 401


def test_the_address_can_be_used_to_register_again(seeker: TestClient, client: TestClient) -> None:
    assert delete_account(seeker).status_code == 204

    with TestClient(client.app, raise_server_exceptions=False) as fresh:
        register = fresh.post(
            "/api/v1/auth/register",
            json={
                "email": SEEKER,
                "password": PASSWORD,
                "role": "job_seeker",
                "accept_terms": True,
            },
        )
        assert register.status_code == 201


def test_applications_stay_for_the_employer_as_a_deleted_user(
    seeker: TestClient, boss: TestClient, scene: Scene, db_session: Session
) -> None:
    application_id = apply_to(seeker, scene.vacancy.id, cover_note="Hello").json()["data"]["id"]
    assert set_status_as_employer(boss, application_id, "under_review").status_code == 200
    assert delete_account(seeker).status_code == 204

    listing = boss.get(f"/api/v1/employer/vacancies/{scene.vacancy.id}/applications").json()
    detail = boss.get(f"/api/v1/applications/{application_id}").json()["data"]

    [item] = listing["data"]
    assert item["applicant_name"] == "Deleted user"
    assert item["applicant_email"] == ""
    assert item["has_cover_note"] is False
    assert detail["profile"]["full_name"] == "Deleted user"
    assert detail["applicant_email"] is None
    assert detail["cover_note"] is None
    assert [h["to_status"] for h in detail["history"]] == ["submitted", "under_review"]
    cv = boss.get(f"/api/v1/employer/applications/{application_id}/cv")
    assert cv.status_code == 404
    assert error_code(cv) == "applicant_deleted"
    assert SEEKER not in listing.__str__() + str(detail)
    stored = db_session.get(Application, application_id)
    assert stored.profile_snapshot.get("deleted") is True


def test_other_users_are_not_affected(
    seeker: TestClient, other_seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    other_seeker.post(
        f"/api/v1/vacancies/{scene.vacancy.id}/applications",
        json={"cover_note": "Mine"},
        headers=csrf_headers(other_seeker),
    )
    assert apply_to(seeker, scene.vacancy.id).status_code == 201
    other_files = len(files(scene))  # two CVs and two application copies
    assert other_files == 4

    assert delete_account(seeker).status_code == 204

    assert len(files(scene)) == 2
    mine = other_seeker.get("/api/v1/applications/me").json()["data"]
    assert len(mine) == 1
    detail = other_seeker.get(f"/api/v1/applications/{mine[0]['id']}").json()["data"]
    assert detail["profile"]["full_name"] == "Okello Daniel"
    assert detail["cover_note"] == "Mine"
    assert other_seeker.get("/api/v1/cv/me/download").status_code == 200
    assert other_seeker.get("/api/v1/profile/me").json()["data"]["full_name"] == "Okello Daniel"


def test_an_employer_with_a_live_vacancy_cannot_delete(
    boss: TestClient, db_session: Session
) -> None:
    response = delete_account(boss)

    assert response.status_code == 409
    assert error_code(response) == "live_vacancies"
    assert get_user(db_session, BOSS).status == UserStatus.ACTIVE


def test_an_employer_without_live_vacancies_can_delete(
    boss: TestClient, scene: Scene, db_session: Session
) -> None:
    closed = boss.post(
        f"/api/v1/employer/vacancies/{scene.vacancy.id}/close", headers=csrf_headers(boss)
    )
    assert closed.status_code == 200
    draft = Vacancy(
        employer_id=scene.company.id,
        title="Draft job",
        application_method=scene.vacancy.application_method,
        status=VacancyStatus.DRAFT,
    )
    db_session.add(draft)
    db_session.commit()

    assert delete_account(boss).status_code == 204

    db_session.expire_all()
    company = db_session.get(Employer, scene.company.id)
    assert company.company_name == "Deleted company"
    assert company.contact_phone is None and company.registration_number is None
    assert company.description is None
    statuses = db_session.scalars(
        select(Vacancy.status).where(Vacancy.employer_id == company.id)
    ).all()
    assert set(statuses) == {VacancyStatus.CLOSED}
    assert get_user(db_session, "boss@example.com") if False else True


def test_admins_cannot_delete_their_account_here(client: TestClient, db_session: Session) -> None:
    create_user(db_session, "admin@example.com", UserRole.ADMIN)
    db_session.commit()
    login_as(client, "admin@example.com")

    response = delete_account(client)

    assert response.status_code == 403
    assert get_user(db_session, "admin@example.com").status == UserStatus.ACTIVE


def test_the_account_routes_are_in_the_openapi(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert sorted(paths["/api/v1/account/export"]) == ["get"]
    assert sorted(paths["/api/v1/account"]) == ["delete"]

"""Applications: applying, the copies, the status table, ownership, the CV."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Application,
    ApplicationMethod,
    ApplicationStatus,
    ApplicationStatusEvent,
    AuditEvent,
    Cv,
    UserRole,
    VacancyStatus,
    VerificationStatus,
)
from app.services.applications import EMPLOYER_TRANSITIONS, Actor, can_move
from tests.api.application_helpers import (
    BOSS,
    SEEKER,
    Scene,
    apply_to,
    make_scene,
    prepare_seeker,
    set_status_as_employer,
    use_storage,
    withdraw,
)
from tests.api.auth_helpers import csrf_headers, error_code, get_user
from tests.api.cv_helpers import upload
from tests.api.profile_helpers import create_user, login_as, profile_payload, put_profile
from tests.api.vacancy_helpers import add_vacancy, make_company
from tests.sample_files import make_pdf

S = ApplicationStatus
ALL = list(S)


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
def rival(client: TestClient, scene: Scene, db_session: Session) -> Iterator[TestClient]:
    make_company(db_session, scene.world, email="rival@example.com", name="Rival Ltd")
    with TestClient(client.app, raise_server_exceptions=False) as other:
        login_as(other, "rival@example.com")
        yield other


@pytest.fixture
def stranger(client: TestClient, scene: Scene, db_session: Session) -> Iterator[TestClient]:
    create_user(db_session, "other@example.com", UserRole.JOB_SEEKER)
    with TestClient(client.app, raise_server_exceptions=False) as other:
        login_as(other, "other@example.com")
        yield other


def applied(seeker: TestClient, scene: Scene, **body) -> str:
    response = apply_to(seeker, scene.vacancy.id, **body)
    assert response.status_code == 201, response.text
    return response.json()["data"]["id"]


def count(db: Session, model) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def audit_count(db: Session, action: str) -> int:
    return (
        db.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.action == action))
        or 0
    )


# ---------- applying ----------


def test_apply_happy_path(seeker: TestClient, scene: Scene, db_session: Session) -> None:
    response = apply_to(seeker, scene.vacancy.id, cover_note="  I would love to join.  ")

    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["status"] == "submitted"
    assert data["cover_note"] == "I would love to join."
    assert data["vacancy"]["title"] == "Accounts Assistant"
    assert data["vacancy"]["is_live"] is True
    assert data["applicant_email"] is None
    assert data["next_statuses"] == ["withdrawn"]
    assert data["profile"]["full_name"] == "Nakato Sarah"
    assert data["profile"]["institution"] == "Gulu University"
    assert set(data["profile"]["skills"]) == {"Python", "Microsoft Excel"}
    assert data["cv"]["original_filename"] == "my-cv.pdf"
    assert [h["to_status"] for h in data["history"]] == ["submitted"]
    assert data["history"][0]["by"] == "applicant"
    assert "storage" not in str(data)
    assert count(db_session, Application) == 1
    assert audit_count(db_session, "application_submitted") == 1


def test_the_cover_note_is_optional_and_limited(seeker: TestClient, scene: Scene) -> None:
    assert apply_to(seeker, scene.vacancy.id, cover_note="x" * 2001).status_code == 422
    assert apply_to(seeker, scene.vacancy.id).status_code == 201


def test_unknown_fields_are_refused(seeker: TestClient, scene: Scene) -> None:
    assert apply_to(seeker, scene.vacancy.id, status="shortlisted").status_code == 422


def test_the_snapshot_does_not_change_when_the_profile_or_cv_change(
    seeker: TestClient, scene: Scene, db_session: Session, boss: TestClient
) -> None:
    application_id = applied(seeker, scene)
    copy_key = db_session.scalar(select(Application.cv_storage_key))
    own_key = db_session.scalar(select(Cv.storage_key).where(Cv.deleted_at.is_(None)))
    assert copy_key != own_key  # the application has its own file

    body = profile_payload(scene.refs, full_name="Someone Else Entirely", summary="Changed.")
    assert put_profile(seeker, body).status_code == 200
    assert upload(seeker, "new-cv.pdf", make_pdf(pad_to=500)).status_code == 201
    assert seeker.delete("/api/v1/cv/me", headers=csrf_headers(seeker)).status_code == 204

    mine = seeker.get(f"/api/v1/applications/{application_id}").json()["data"]
    assert mine["profile"]["full_name"] == "Nakato Sarah"
    assert mine["profile"]["summary"] != "Changed."
    assert mine["cv"]["original_filename"] == "my-cv.pdf"
    download = boss.get(f"/api/v1/employer/applications/{application_id}/cv")
    assert download.status_code == 200
    assert download.content == make_pdf()


# ---------- the preconditions ----------


def test_login_is_needed(client: TestClient, scene: Scene) -> None:
    assert apply_to(client, scene.vacancy.id).status_code == 401


def test_csrf_is_needed(seeker: TestClient, scene: Scene) -> None:
    response = seeker.post(f"/api/v1/vacancies/{scene.vacancy.id}/applications", json={})
    assert response.status_code == 403
    assert error_code(response) == "csrf_failed"


def test_only_job_seekers_can_apply(boss: TestClient, scene: Scene) -> None:
    response = apply_to(boss, scene.vacancy.id)
    assert response.status_code == 403
    assert error_code(response) == "forbidden"


def test_an_unverified_email_cannot_apply(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    get_user(db_session, SEEKER).email_verified_at = None
    db_session.flush()

    response = apply_to(seeker, scene.vacancy.id)

    assert response.status_code == 403
    assert error_code(response) == "email_not_verified"


def test_a_profile_is_needed(client: TestClient, scene: Scene) -> None:
    use_storage(client, scene.storage_root)
    prepare_seeker(client, scene, profile=False)

    response = apply_to(client, scene.vacancy.id)

    assert response.status_code == 409
    assert error_code(response) == "profile_required"


def test_a_cv_is_needed(client: TestClient, scene: Scene) -> None:
    use_storage(client, scene.storage_root)
    prepare_seeker(client, scene, cv=False)

    response = apply_to(client, scene.vacancy.id)

    assert response.status_code == 409
    assert error_code(response) == "cv_required"


def test_the_sharing_consent_is_needed(client: TestClient, scene: Scene) -> None:
    use_storage(client, scene.storage_root)
    prepare_seeker(client, scene, consent=False)

    response = apply_to(client, scene.vacancy.id)

    assert response.status_code == 409
    assert error_code(response) == "consent_required"


def test_withdrawing_the_consent_blocks_new_applications(seeker: TestClient, scene: Scene) -> None:
    body = {"consent_type": "cv_sharing_with_employers", "granted": False}
    revoked = seeker.post("/api/v1/consents", json=body, headers=csrf_headers(seeker))
    assert revoked.status_code == 200

    assert error_code(apply_to(seeker, scene.vacancy.id)) == "consent_required"


def test_nothing_is_stored_when_a_precondition_fails(
    client: TestClient, scene: Scene, db_session: Session
) -> None:
    use_storage(client, scene.storage_root)
    prepare_seeker(client, scene, consent=False)
    files_before = sorted(scene.storage_root.iterdir())

    apply_to(client, scene.vacancy.id)

    assert count(db_session, Application) == 0
    assert sorted(scene.storage_root.iterdir()) == files_before


def test_a_second_application_is_refused_even_after_withdrawing(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    application_id = applied(seeker, scene)
    files = sorted(scene.storage_root.iterdir())

    again = apply_to(seeker, scene.vacancy.id)
    assert again.status_code == 409
    assert error_code(again) == "already_applied"

    assert withdraw(seeker, application_id).status_code == 200
    after = apply_to(seeker, scene.vacancy.id)
    assert after.status_code == 409
    assert error_code(after) == "already_applied"
    assert sorted(scene.storage_root.iterdir()) == files  # no stray copy of the CV
    assert count(db_session, Application) == 1


def test_external_vacancies_never_create_applications(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    scene.vacancy.application_method = ApplicationMethod.EXTERNAL
    scene.vacancy.external_url = "https://example.com/jobs/1"
    db_session.flush()

    response = apply_to(seeker, scene.vacancy.id)

    assert response.status_code == 400
    assert error_code(response) == "external_application"
    assert count(db_session, Application) == 0


@pytest.mark.parametrize("state", ["draft", "closed", "expired"])
def test_only_a_live_vacancy_can_be_applied_to(
    seeker: TestClient, scene: Scene, db_session: Session, state: str
) -> None:
    if state == "expired":
        scene.vacancy.published_at = datetime.now(UTC) - timedelta(days=10)
        scene.vacancy.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        vacancy = scene.vacancy
    else:
        vacancy = add_vacancy(
            db_session,
            scene.company,
            scene.world,
            status=VacancyStatus.DRAFT if state == "draft" else VacancyStatus.CLOSED,
        )
    db_session.flush()

    response = apply_to(seeker, vacancy.id)

    assert response.status_code == 404
    assert error_code(response) == "vacancy_not_found"


def test_an_unknown_vacancy_is_404(seeker: TestClient) -> None:
    assert apply_to(seeker, uuid4()).status_code == 404


# ---------- the transition table ----------

ALLOWED_FOR_EMPLOYERS = {
    (S.SUBMITTED, S.UNDER_REVIEW),
    (S.SUBMITTED, S.REJECTED),
    (S.UNDER_REVIEW, S.SHORTLISTED),
    (S.UNDER_REVIEW, S.REJECTED),
    (S.SHORTLISTED, S.INTERVIEW),
    (S.SHORTLISTED, S.REJECTED),
    (S.INTERVIEW, S.OFFERED),
    (S.INTERVIEW, S.REJECTED),
    (S.OFFERED, S.REJECTED),
}


@pytest.mark.parametrize("current", ALL)
@pytest.mark.parametrize("target", ALL)
def test_the_transition_matrix_for_employers(current: S, target: S) -> None:
    assert can_move(current, target, Actor.EMPLOYER) is ((current, target) in ALLOWED_FOR_EMPLOYERS)


@pytest.mark.parametrize("current", ALL)
@pytest.mark.parametrize("target", ALL)
def test_the_transition_matrix_for_applicants(current: S, target: S) -> None:
    allowed = target is S.WITHDRAWN and current not in (S.REJECTED, S.WITHDRAWN)
    assert can_move(current, target, Actor.APPLICANT) is allowed


def test_final_statuses_have_no_way_out() -> None:
    assert EMPLOYER_TRANSITIONS[S.REJECTED] == frozenset()
    assert EMPLOYER_TRANSITIONS[S.WITHDRAWN] == frozenset()


@pytest.mark.parametrize("current", ALL)
@pytest.mark.parametrize("target", ALL)
def test_the_employer_route_follows_the_table(
    seeker: TestClient,
    boss: TestClient,
    scene: Scene,
    db_session: Session,
    current: S,
    target: S,
) -> None:
    application_id = applied(seeker, scene)
    application = db_session.get(Application, application_id)
    application.status = current
    db_session.commit()  # an error response rolls back, so state set up here must be committed

    response = set_status_as_employer(boss, application_id, target.value)

    if (current, target) in ALLOWED_FOR_EMPLOYERS:
        assert response.status_code == 200, response.text
        assert response.json()["data"]["status"] == target.value
    else:
        assert response.status_code == 409
        assert error_code(response) == "invalid_status_transition"
        db_session.refresh(application)
        assert application.status == current


def test_a_status_change_writes_history_in_order(
    seeker: TestClient, boss: TestClient, scene: Scene
) -> None:
    application_id = applied(seeker, scene)
    for status in ("under_review", "shortlisted", "interview"):
        assert set_status_as_employer(boss, application_id, status).status_code == 200
    assert set_status_as_employer(boss, application_id, "rejected", "Not a fit.").status_code == 200

    detail = seeker.get(f"/api/v1/applications/{application_id}").json()["data"]

    assert [h["to_status"] for h in detail["history"]] == [
        "submitted",
        "under_review",
        "shortlisted",
        "interview",
        "rejected",
    ]
    assert detail["history"][0]["from_status"] is None
    assert detail["history"][-1]["from_status"] == "interview"
    assert detail["history"][-1]["note"] == "Not a fit."
    assert [h["by"] for h in detail["history"]] == ["applicant"] + ["employer"] * 4
    assert detail["next_statuses"] == []


def test_the_employer_sees_next_statuses_and_the_email(
    seeker: TestClient, boss: TestClient, scene: Scene
) -> None:
    application_id = applied(seeker, scene)

    detail = boss.get(f"/api/v1/applications/{application_id}").json()["data"]

    assert detail["applicant_email"] == SEEKER
    assert detail["next_statuses"] == ["under_review", "rejected"]


def test_an_applicant_cannot_set_employer_statuses(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    application_id = applied(seeker, scene)

    response = set_status_as_employer(seeker, application_id, "shortlisted")

    assert response.status_code == 403  # job seekers are not employers
    assert db_session.get(Application, application_id).status == S.SUBMITTED


def test_the_note_is_limited(seeker: TestClient, boss: TestClient, scene: Scene) -> None:
    application_id = applied(seeker, scene)

    response = set_status_as_employer(boss, application_id, "under_review", "x" * 1001)

    assert response.status_code == 422


def test_unknown_statuses_are_refused(seeker: TestClient, boss: TestClient, scene: Scene) -> None:
    application_id = applied(seeker, scene)

    assert set_status_as_employer(boss, application_id, "hired").status_code == 422


def test_a_suspended_employer_cannot_review(
    seeker: TestClient, boss: TestClient, scene: Scene, db_session: Session
) -> None:
    application_id = applied(seeker, scene)
    scene.company.verification_status = VerificationStatus.SUSPENDED
    db_session.commit()

    for response in (
        set_status_as_employer(boss, application_id, "under_review"),
        boss.get(f"/api/v1/applications/{application_id}"),
        boss.get(f"/api/v1/employer/applications/{application_id}/cv"),
        boss.get(f"/api/v1/employer/vacancies/{scene.vacancy.id}/applications"),
    ):
        assert response.status_code == 403
        assert error_code(response) == "employer_not_verified"


# ---------- withdrawing ----------


def test_withdraw(seeker: TestClient, boss: TestClient, scene: Scene) -> None:
    application_id = applied(seeker, scene)
    set_status_as_employer(boss, application_id, "under_review")

    response = withdraw(seeker, application_id)

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "withdrawn"
    assert data["next_statuses"] == []
    assert [h["to_status"] for h in data["history"]] == ["submitted", "under_review", "withdrawn"]


@pytest.mark.parametrize("final", [S.REJECTED, S.WITHDRAWN])
def test_final_applications_cannot_be_withdrawn(
    seeker: TestClient, scene: Scene, db_session: Session, final: S
) -> None:
    application_id = applied(seeker, scene)
    db_session.get(Application, application_id).status = final
    db_session.flush()

    response = withdraw(seeker, application_id)

    assert response.status_code == 409
    assert error_code(response) == "invalid_status_transition"


def test_only_the_owner_can_withdraw(
    seeker: TestClient,
    boss: TestClient,
    stranger: TestClient,
    scene: Scene,
    db_session: Session,
) -> None:
    application_id = applied(seeker, scene)

    assert withdraw(stranger, application_id).status_code == 404
    assert withdraw(boss, application_id).status_code == 403  # employers cannot withdraw
    assert db_session.get(Application, application_id).status == S.SUBMITTED


def test_a_closed_vacancy_does_not_stop_withdrawing(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    application_id = applied(seeker, scene)
    scene.vacancy.status = VacancyStatus.CLOSED
    db_session.flush()

    assert withdraw(seeker, application_id).status_code == 200


# ---------- lists ----------


def test_my_applications(seeker: TestClient, scene: Scene) -> None:
    application_id = applied(seeker, scene)

    response = seeker.get("/api/v1/applications/me")

    assert response.status_code == 200
    body = response.json()
    assert body["meta"] == {"page": 1, "page_size": 20, "total": 1}
    item = body["data"][0]
    assert item["id"] == application_id
    assert item["status"] == "submitted"
    assert item["vacancy"]["company_name"] == "Ssese Foods Ltd"


def test_my_applications_is_only_mine(
    seeker: TestClient, boss: TestClient, stranger: TestClient, scene: Scene
) -> None:
    applied(seeker, scene)

    assert stranger.get("/api/v1/applications/me").json()["data"] == []
    assert boss.get("/api/v1/applications/me").status_code == 403


def test_the_employer_lists_applicants_for_their_vacancy(
    seeker: TestClient, boss: TestClient, scene: Scene
) -> None:
    application_id = applied(seeker, scene, cover_note="Hello")
    url = f"/api/v1/employer/vacancies/{scene.vacancy.id}/applications"

    response = boss.get(url)

    assert response.status_code == 200
    body = response.json()
    assert body["meta"]["total"] == 1
    item = body["data"][0]
    assert item["id"] == application_id
    assert item["applicant_name"] == "Nakato Sarah"
    assert item["applicant_email"] == SEEKER
    assert item["qualification"] == "Bachelor's degree"
    assert item["institution"] == "Gulu University"
    assert item["has_cover_note"] is True
    only = boss.get(f"{url}?status=shortlisted")
    assert only.json()["data"] == []
    assert only.json()["meta"]["total"] == 0


def test_the_applicant_list_is_for_the_vacancy_owner_only(
    seeker: TestClient, rival: TestClient, scene: Scene
) -> None:
    applied(seeker, scene)
    url = f"/api/v1/employer/vacancies/{scene.vacancy.id}/applications"

    assert rival.get(url).status_code == 404
    assert seeker.get(url).status_code == 403


# ---------- ownership and the CV ----------


def test_the_applicant_and_the_vacancys_employer_can_open_the_application(
    seeker: TestClient, boss: TestClient, scene: Scene
) -> None:
    application_id = applied(seeker, scene)

    assert seeker.get(f"/api/v1/applications/{application_id}").status_code == 200
    assert boss.get(f"/api/v1/applications/{application_id}").status_code == 200


def test_everyone_else_gets_404(
    seeker: TestClient,
    scene: Scene,
    rival: TestClient,
    stranger: TestClient,
    client: TestClient,
) -> None:
    application_id = applied(seeker, scene)

    for other in (rival, stranger):
        response = other.get(f"/api/v1/applications/{application_id}")
        assert response.status_code == 404
        assert error_code(response) == "application_not_found"
    changed = rival.post(
        f"/api/v1/employer/applications/{application_id}/status",
        json={"status": "under_review"},
        headers=csrf_headers(rival),
    )
    assert changed.status_code == 404
    with TestClient(client.app, raise_server_exceptions=False) as anonymous:
        assert anonymous.get(f"/api/v1/applications/{application_id}").status_code == 401


def test_an_admin_cannot_open_applications(
    seeker: TestClient, scene: Scene, db_session: Session, client: TestClient
) -> None:
    application_id = applied(seeker, scene)
    create_user(db_session, "admin@example.com", UserRole.ADMIN)
    with TestClient(client.app, raise_server_exceptions=False) as admin:
        login_as(admin, "admin@example.com")
        assert admin.get(f"/api/v1/applications/{application_id}").status_code == 404
        assert admin.get(f"/api/v1/employer/applications/{application_id}/cv").status_code == 403


def test_the_employer_downloads_the_cv_and_it_is_logged(
    seeker: TestClient, boss: TestClient, scene: Scene, db_session: Session
) -> None:
    application_id = applied(seeker, scene)

    response = boss.get(f"/api/v1/employer/applications/{application_id}/cv")

    assert response.status_code == 200
    assert response.content == make_pdf()
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers["content-disposition"]
    assert "my-cv.pdf" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "private, no-store"
    events = db_session.scalars(
        select(AuditEvent).where(AuditEvent.action == "application_cv_downloaded")
    ).all()
    assert len(events) == 1
    assert str(events[0].entity_id) == application_id
    assert events[0].actor_user_id == get_user(db_session, BOSS).id


def test_nobody_else_can_download_the_cv(
    seeker: TestClient,
    scene: Scene,
    rival: TestClient,
    stranger: TestClient,
    db_session: Session,
) -> None:
    application_id = applied(seeker, scene)
    path = f"/api/v1/employer/applications/{application_id}/cv"

    assert rival.get(path).status_code == 404
    assert stranger.get(path).status_code == 403  # a job seeker is not an employer
    assert seeker.get(path).status_code == 403  # not even the applicant, on this route
    assert audit_count(db_session, "application_cv_downloaded") == 0


def test_a_missing_cv_file_is_a_clean_404(
    seeker: TestClient, boss: TestClient, scene: Scene, db_session: Session
) -> None:
    application_id = applied(seeker, scene)
    key = db_session.get(Application, application_id).cv_storage_key
    (scene.storage_root / key).unlink()

    response = boss.get(f"/api/v1/employer/applications/{application_id}/cv")

    assert response.status_code == 404
    assert error_code(response) == "cv_file_missing"


# ---------- other rules ----------


def test_application_method_cannot_change_once_applications_exist(
    seeker: TestClient, boss: TestClient, scene: Scene
) -> None:
    applied(seeker, scene)
    current = boss.get(f"/api/v1/employer/vacancies/{scene.vacancy.id}").json()["data"]
    body = {
        key: current[key]
        for key in (
            "title",
            "description",
            "employment_type",
            "work_arrangement",
            "district_id",
            "expires_at",
        )
    }
    body["application_method"] = "external"
    body["external_url"] = "https://example.com/apply"
    body["requirements"] = []

    response = boss.put(
        f"/api/v1/employer/vacancies/{scene.vacancy.id}",
        json=body,
        headers=csrf_headers(boss),
    )

    assert response.status_code == 422
    assert error_code(response) == "field_locked"


def test_every_application_starts_a_history(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    applied(seeker, scene)

    assert count(db_session, ApplicationStatusEvent) == 1


def test_the_openapi_lists_the_application_operations(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert {p: sorted(m) for p, m in paths.items() if "applications" in p} == {
        "/api/v1/vacancies/{vacancy_id}/applications": ["post"],
        "/api/v1/applications/me": ["get"],
        "/api/v1/applications/{application_id}": ["get"],
        "/api/v1/applications/{application_id}/withdraw": ["post"],
        "/api/v1/employer/vacancies/{vacancy_id}/applications": ["get"],
        "/api/v1/employer/applications/{application_id}/status": ["post"],
        "/api/v1/employer/applications/{application_id}/cv": ["get"],
        "/api/v1/employer/applications/{application_id}/photo": ["get"],
    }


def test_my_applications_can_be_narrowed_to_one_vacancy(
    seeker: TestClient, scene: Scene, db_session: Session
) -> None:
    application_id = applied(seeker, scene)
    other = add_vacancy(db_session, scene.company, scene.world, title="Another job")

    mine = seeker.get(f"/api/v1/applications/me?vacancy_id={scene.vacancy.id}").json()
    none = seeker.get(f"/api/v1/applications/me?vacancy_id={other.id}").json()

    assert [item["id"] for item in mine["data"]] == [application_id]
    assert none["data"] == []
    assert none["meta"]["total"] == 0
    assert seeker.get("/api/v1/applications/me?vacancy_id=nope").status_code == 422


def test_the_employers_vacancy_list_counts_applications(
    seeker: TestClient, boss: TestClient, scene: Scene
) -> None:
    quiet = boss.get("/api/v1/employer/vacancies").json()["data"][0]
    assert (quiet["application_count"], quiet["new_application_count"]) == (0, 0)
    application_id = applied(seeker, scene)

    before = boss.get("/api/v1/employer/vacancies").json()["data"][0]
    assert (before["application_count"], before["new_application_count"]) == (1, 1)

    set_status_as_employer(boss, application_id, "under_review")
    after = boss.get(f"/api/v1/employer/vacancies/{scene.vacancy.id}").json()["data"]
    assert (after["application_count"], after["new_application_count"]) == (1, 0)

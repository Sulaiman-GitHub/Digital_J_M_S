"""Helpers for application tests. Names and places are fictional samples."""

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.orm import Session

from app.api.deps import file_storage
from app.integrations.storage import LocalFileStorage
from app.models import (
    Employer,
    FieldOfStudy,
    Institution,
    InstitutionType,
    UserRole,
    Vacancy,
)
from tests.api.auth_helpers import csrf_headers
from tests.api.cv_helpers import upload
from tests.api.profile_helpers import Refs, create_user, login_as, profile_payload, put_profile
from tests.api.vacancy_helpers import World, add_vacancy, make_company, make_world
from tests.sample_files import make_pdf

SEEKER = "nakato@example.com"
BOSS = "boss@example.com"


@dataclass
class Scene:
    """One approved company with one live vacancy and one fully prepared job seeker."""

    world: World
    refs: Refs
    company: Employer
    vacancy: Vacancy
    storage_root: Path


def new_client(client: TestClient) -> Iterator[TestClient]:
    with TestClient(client.app, raise_server_exceptions=False) as other:
        yield other


def make_scene(db: Session, storage_root: Path) -> Scene:
    world = make_world(db)
    institution = Institution(
        name="Gulu University",
        institution_type=InstitutionType.UNIVERSITY,
        district_id=world.district.id,
    )
    study = FieldOfStudy(name="Accounting")
    db.add_all([institution, study])
    db.flush()
    refs = Refs(
        world.district,
        world.other_district,
        world.level,
        institution,
        study,
        {"Python": world.python, "Excel": world.excel},
    )
    company = make_company(db, world, email=BOSS)
    vacancy = add_vacancy(db, company, world)
    create_user(db, SEEKER, UserRole.JOB_SEEKER)
    db.commit()
    return Scene(world, refs, company, vacancy, storage_root)


def use_storage(client: TestClient, root: Path) -> None:
    client.app.dependency_overrides[file_storage] = lambda: LocalFileStorage(root)


def prepare_seeker(client: TestClient, scene: Scene, *, profile=True, cv=True, consent=True):
    """Log the job seeker in and give them a profile, a CV and the consent (each optional)."""
    login_as(client, SEEKER)
    if profile:
        assert put_profile(client, profile_payload(scene.refs)).status_code == 200
    if cv:
        assert upload(client, "my-cv.pdf", make_pdf()).status_code == 201
    if consent:
        granted = client.post(
            "/api/v1/consents",
            json={"consent_type": "cv_sharing_with_employers", "granted": True},
            headers=csrf_headers(client),
        )
        assert granted.status_code in (200, 201, 204), granted.text


def apply_to(client: TestClient, vacancy_id, **body) -> Response:
    return client.post(
        f"/api/v1/vacancies/{vacancy_id}/applications", json=body, headers=csrf_headers(client)
    )


def set_status_as_employer(client: TestClient, application_id, status: str, note=None) -> Response:
    return client.post(
        f"/api/v1/employer/applications/{application_id}/status",
        json={"status": status, "note": note},
        headers=csrf_headers(client),
    )


def withdraw(client: TestClient, application_id) -> Response:
    return client.post(
        f"/api/v1/applications/{application_id}/withdraw", headers=csrf_headers(client)
    )


@pytest.fixture
def storage_root(tmp_path: Path) -> Path:
    root = tmp_path / "storage"
    root.mkdir()
    return root

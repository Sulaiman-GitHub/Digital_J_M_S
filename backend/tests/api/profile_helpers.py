"""Helpers for profile tests. Names and places are fictional samples."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy.orm import Session

from app.core.security import hash_password, normalise_email
from app.models import (
    District,
    FieldOfStudy,
    Institution,
    InstitutionType,
    QualificationLevel,
    Skill,
    User,
    UserRole,
)
from tests.api.auth_helpers import PASSWORD, csrf_headers, login

PROFILE = "/api/v1/profile/me"


@dataclass
class Refs:
    district: District
    other_district: District
    level: QualificationLevel
    institution: Institution
    field_of_study: FieldOfStudy
    skills: dict[str, Skill] = field(default_factory=dict)


def make_refs(db: Session) -> Refs:
    district = District(name="Gulu", region="Northern")
    other_district = District(name="Mbarara", region="Western")
    level = QualificationLevel(name="Bachelor's degree", rank=3)
    db.add_all([district, other_district, level])
    db.flush()
    institution = Institution(
        name="Gulu University",
        institution_type=InstitutionType.UNIVERSITY,
        district_id=district.id,
    )
    field_of_study = FieldOfStudy(name="Accounting")
    skills = {
        name: Skill(name=name, name_normalized=name.lower())
        for name in ("Python", "Excel", "Teaching", "Welding")
    }
    db.add_all([institution, field_of_study, *skills.values()])
    db.flush()
    return Refs(district, other_district, level, institution, field_of_study, skills)


def experience(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "title": "Accounts Intern",
        "organisation": "Ssese Fresh Foods Ltd",
        "start_date": "2024-01-08",
        "end_date": "2024-06-28",
        "description": "Recorded supplier invoices and reconciled bank statements.",
    }
    return {**base, **overrides}


def profile_payload(refs: Refs, **overrides: Any) -> dict[str, Any]:
    """A valid, complete profile. Pass a field as None to blank it, or any value to replace it."""
    base: dict[str, Any] = {
        "full_name": "Nakato Sarah",
        "phone": "0772 123456",
        "institution_id": str(refs.institution.id),
        "institution_other_name": None,
        "qualification_level_id": str(refs.level.id),
        "field_of_study_id": str(refs.field_of_study.id),
        "field_of_study_other": None,
        "study_status": "completed",
        "expected_completion_date": None,
        "graduation_date": "2025-07-15",
        "district_id": str(refs.district.id),
        "summary": "Recent accounting graduate looking for a trainee role.",
        "skill_ids": [str(refs.skills["Python"].id), str(refs.skills["Excel"].id)],
        "experiences": [experience()],
    }
    return {**base, **overrides}


def put_profile(client: TestClient, payload: dict[str, Any]) -> Response:
    return client.put(PROFILE, json=payload, headers=csrf_headers(client))


def create_user(db: Session, email: str, role: UserRole) -> None:
    """A verified user created directly (admins cannot register through the API)."""
    db.add(
        User(
            email=email,
            email_normalized=normalise_email(email),
            password_hash=hash_password(PASSWORD),
            role=role,
            email_verified_at=datetime.now(UTC),
        )
    )
    db.flush()


def login_as(client: TestClient, email: str) -> None:
    response = login(client, email)
    assert response.status_code == 200, response.text


def field_errors(response: Response) -> dict[str, str]:
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "validation_error"
    return response.json()["error"]["details"]["fields"]

"""Helpers for vacancy tests. Names and places are fictional samples."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    District,
    Employer,
    EmploymentType,
    QualificationLevel,
    Skill,
    UserRole,
    Vacancy,
    VacancyStatus,
    VerificationStatus,
    WorkArrangement,
)
from tests.api.auth_helpers import csrf_headers, get_user
from tests.api.profile_helpers import create_user

EMPLOYER_VACANCIES = "/api/v1/employer/vacancies"
ADMIN_VACANCIES = "/api/v1/admin/vacancies"


@dataclass
class World:
    district: District
    other_district: District
    level: QualificationLevel
    python: Skill
    excel: Skill


def make_world(db: Session) -> World:
    district = District(name="Gulu", region="Northern")
    other = District(name="Mbarara", region="Western")
    level = QualificationLevel(name="Bachelor's degree", rank=3)
    python = Skill(name="Python", name_normalized="python")
    excel = Skill(name="Microsoft Excel", name_normalized="microsoft excel")
    db.add_all([district, other, level, python, excel])
    db.flush()
    return World(district, other, level, python, excel)


def make_company(
    db: Session,
    world: World,
    email: str = "boss@example.com",
    status: VerificationStatus = VerificationStatus.APPROVED,
    name: str = "Ssese Foods Ltd",
) -> Employer:
    """A verified employer user with a company in the given verification status."""
    create_user(db, email, UserRole.EMPLOYER)
    employer = Employer(
        owner_user_id=get_user(db, email).id,
        company_name=name,
        registration_number="80020012345678",
        contact_phone="+256414123456",
        description="We make juice.",
        district_id=world.district.id,
        verification_status=status,
    )
    db.add(employer)
    db.commit()
    return employer


def in_days(days: float) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def payload(world: World, **overrides: Any) -> dict[str, Any]:
    """A complete, publishable vacancy."""
    body: dict[str, Any] = {
        "title": "Accounts Assistant",
        "description": "Prepare invoices and reconcile accounts.",
        "employment_type": "full_time",
        "work_arrangement": "onsite",
        "district_id": str(world.district.id),
        "min_qualification_level_id": str(world.level.id),
        "min_experience_years": 1,
        "salary_min": 800_000,
        "salary_max": 1_200_000,
        "show_salary": True,
        "application_method": "internal",
        "external_url": None,
        "expires_at": in_days(30),
        "requirements": [
            {"kind": "skill", "skill_id": str(world.excel.id), "is_mandatory": True},
            {"kind": "certification", "label": "CPA Part 1", "is_mandatory": False},
        ],
    }
    body.update(overrides)
    return body


def create(client: TestClient, body: dict[str, Any]) -> Response:
    return client.post(EMPLOYER_VACANCIES, json=body, headers=csrf_headers(client))


def put(client: TestClient, vacancy_id: str, body: dict[str, Any]) -> Response:
    return client.put(f"{EMPLOYER_VACANCIES}/{vacancy_id}", json=body, headers=csrf_headers(client))


def action(client: TestClient, vacancy_id: str, name: str) -> Response:
    return client.post(f"{EMPLOYER_VACANCIES}/{vacancy_id}/{name}", headers=csrf_headers(client))


def fields_of(response: Response) -> dict[str, str]:
    return response.json()["error"]["details"]["fields"]


def employer_row(db: Session, email: str = "boss@example.com") -> Employer:
    return db.scalars(
        select(Employer).where(Employer.owner_user_id == get_user(db, email).id)
    ).one()


def add_vacancy(db: Session, company: Employer, world: World, **overrides: Any) -> Vacancy:
    """A live vacancy unless told otherwise (set status, or an expiry in the past)."""
    published_at = overrides.pop("published_at", datetime.now(UTC) - timedelta(days=1))
    values: dict[str, Any] = {
        "employer_id": company.id,
        "title": "Accounts Assistant",
        "description": "Prepare invoices.",
        "employment_type": EmploymentType.FULL_TIME,
        "work_arrangement": WorkArrangement.ONSITE,
        "district_id": world.district.id,
        "status": VacancyStatus.PUBLISHED,
        "published_at": published_at,
        "expires_at": published_at + timedelta(days=30),
    }
    values.update(overrides)
    if values["status"] == VacancyStatus.DRAFT:
        values["published_at"] = None
    vacancy = Vacancy(**values)
    db.add(vacancy)
    db.commit()
    return vacancy

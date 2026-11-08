"""The database enforces the vacancy rules itself, whatever the API does."""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    ApplicationMethod,
    District,
    Employer,
    EmploymentType,
    RequirementKind,
    Skill,
    Vacancy,
    VacancyRequirement,
    VacancyStatus,
    WorkArrangement,
)
from tests.api.vacancy_helpers import make_company, make_world

NOW = datetime.now(UTC)


@pytest.fixture
def employer(db_session: Session) -> Employer:
    world = make_world(db_session)
    return make_company(db_session, world)


def make_vacancy(db: Session, employer: Employer, **extra: Any) -> Vacancy:
    district = db.scalar(select(District))
    values: dict[str, Any] = {"employer_id": employer.id, "title": "Accounts Assistant"}
    values.update(extra)
    if values.get("status") == VacancyStatus.PUBLISHED:
        values.setdefault("description", "Prepare invoices.")
        values.setdefault("employment_type", EmploymentType.FULL_TIME)
        values.setdefault("work_arrangement", WorkArrangement.ONSITE)
        values.setdefault("district_id", district.id if district else None)
        values.setdefault("published_at", NOW)
        values.setdefault("expires_at", NOW + timedelta(days=30))
    vacancy = Vacancy(**values)
    db.add(vacancy)
    db.flush()
    return vacancy


def test_defaults(db_session: Session, employer: Employer) -> None:
    vacancy = make_vacancy(db_session, employer)
    db_session.refresh(vacancy)

    assert vacancy.status == VacancyStatus.DRAFT
    assert vacancy.application_method == ApplicationMethod.INTERNAL
    assert vacancy.min_experience_years == 0
    assert vacancy.show_salary is False and vacancy.created_by_admin is False
    assert vacancy.created_at.tzinfo is not None


def test_a_complete_published_vacancy_is_accepted(db_session: Session, employer: Employer) -> None:
    make_vacancy(db_session, employer, status=VacancyStatus.PUBLISHED)


@pytest.mark.parametrize(
    "missing",
    ["description", "employment_type", "work_arrangement", "expires_at", "published_at"],
)
def test_a_published_vacancy_must_be_complete(
    db_session: Session, employer: Employer, missing: str
) -> None:
    with pytest.raises(IntegrityError, match="ck_vacancies_published_is_complete"):
        make_vacancy(db_session, employer, status=VacancyStatus.PUBLISHED, **{missing: None})


def test_a_published_onsite_vacancy_needs_a_district(
    db_session: Session, employer: Employer
) -> None:
    with pytest.raises(IntegrityError, match="ck_vacancies_published_is_complete"):
        make_vacancy(db_session, employer, status=VacancyStatus.PUBLISHED, district_id=None)


def test_a_published_remote_vacancy_needs_no_district(
    db_session: Session, employer: Employer
) -> None:
    make_vacancy(
        db_session,
        employer,
        status=VacancyStatus.PUBLISHED,
        work_arrangement=WorkArrangement.REMOTE,
        district_id=None,
    )


def test_a_published_vacancy_cannot_outlive_ninety_days(
    db_session: Session, employer: Employer
) -> None:
    make_vacancy(
        db_session, employer, status=VacancyStatus.PUBLISHED, expires_at=NOW + timedelta(days=89)
    )
    with pytest.raises(IntegrityError, match="ck_vacancies_published_is_complete"):
        make_vacancy(
            db_session,
            employer,
            status=VacancyStatus.PUBLISHED,
            expires_at=NOW + timedelta(days=91),
        )


def test_an_unfinished_draft_is_fine_and_so_is_a_closed_one(
    db_session: Session, employer: Employer
) -> None:
    make_vacancy(db_session, employer)
    make_vacancy(db_session, employer, status=VacancyStatus.CLOSED)


@pytest.mark.parametrize(
    ("values", "constraint"),
    [
        ({"salary_min": -1}, "ck_vacancies_salary_min_not_negative"),
        ({"salary_max": -1}, "ck_vacancies_salary_max_not_negative"),
        ({"salary_min": 2000, "salary_max": 1000}, "ck_vacancies_salary_order"),
        ({"min_experience_years": -1}, "ck_vacancies_experience_range"),
        ({"min_experience_years": 51}, "ck_vacancies_experience_range"),
        (
            {"external_url": "http://x.example.com", "application_method": "external"},
            "ck_vacancies_external_url_https",
        ),
        ({"external_url": "https://x.example.com"}, "ck_vacancies_internal_no_url"),
    ],
)
def test_value_rules(
    db_session: Session, employer: Employer, values: dict[str, Any], constraint: str
) -> None:
    with pytest.raises(IntegrityError, match=constraint):
        make_vacancy(db_session, employer, **values)


def test_equal_salaries_and_https_external_links_are_fine(
    db_session: Session, employer: Employer
) -> None:
    make_vacancy(db_session, employer, salary_min=1000, salary_max=1000)
    make_vacancy(
        db_session,
        employer,
        application_method=ApplicationMethod.EXTERNAL,
        external_url="https://jobs.example.com/1",
    )


def test_an_external_vacancy_cannot_be_published_without_a_link(
    db_session: Session, employer: Employer
) -> None:
    with pytest.raises(IntegrityError, match="ck_vacancies_published_is_complete"):
        make_vacancy(
            db_session,
            employer,
            status=VacancyStatus.PUBLISHED,
            application_method=ApplicationMethod.EXTERNAL,
        )


@pytest.mark.parametrize(
    ("column", "value"),
    [
        ("employment_type", "gig"),
        ("work_arrangement", "moon"),
        ("application_method", "pigeon"),
        ("status", "archived"),
    ],
)
def test_enum_columns_are_checked(
    db_session: Session, employer: Employer, column: str, value: str
) -> None:
    vacancy = make_vacancy(db_session, employer)

    with pytest.raises(IntegrityError, match="ck_vacancies_"):
        db_session.execute(
            text(f"update vacancies set {column} = :v where id = :i"),  # noqa: S608
            {"v": value, "i": vacancy.id},
        )


def test_a_vacancy_belongs_to_an_existing_employer(db_session: Session) -> None:
    with pytest.raises(IntegrityError, match="fk_vacancies_employer_id_employers"):
        db_session.add(Vacancy(employer_id=uuid4(), title="Orphan"))
        db_session.flush()


def test_deleting_an_employer_removes_its_vacancies_and_requirements(
    db_session: Session, employer: Employer
) -> None:
    vacancy = make_vacancy(db_session, employer)
    db_session.add(
        VacancyRequirement(vacancy_id=vacancy.id, kind=RequirementKind.OTHER, label="Licence")
    )
    db_session.flush()

    db_session.execute(delete(Employer).where(Employer.id == employer.id))

    assert db_session.scalar(select(func.count()).select_from(Vacancy)) == 0
    assert db_session.scalar(select(func.count()).select_from(VacancyRequirement)) == 0


# ---------- requirements ----------


def requirement(db: Session, vacancy: Vacancy, **values: Any) -> VacancyRequirement:
    item = VacancyRequirement(vacancy_id=vacancy.id, **values)
    db.add(item)
    db.flush()
    return item


def test_requirement_defaults_to_not_mandatory(db_session: Session, employer: Employer) -> None:
    vacancy = make_vacancy(db_session, employer)
    item = requirement(db_session, vacancy, kind=RequirementKind.CERTIFICATION, label="ACCA")
    db_session.refresh(item)

    assert item.is_mandatory is False and item.skill_id is None


def test_a_skill_requirement_needs_a_skill(db_session: Session, employer: Employer) -> None:
    vacancy = make_vacancy(db_session, employer)

    with pytest.raises(IntegrityError, match="skill_has_skill_id"):
        requirement(db_session, vacancy, kind=RequirementKind.SKILL, label="Python")


def test_only_skill_requirements_have_a_skill(db_session: Session, employer: Employer) -> None:
    vacancy = make_vacancy(db_session, employer)
    skill = db_session.scalar(select(Skill))

    with pytest.raises(IntegrityError, match="only_skills_have_skill_id"):
        requirement(
            db_session,
            vacancy,
            kind=RequirementKind.OTHER,
            label="x",
            skill_id=skill.id if skill else None,
        )


@pytest.mark.parametrize("label", ["", "   "])
def test_a_requirement_needs_a_label(db_session: Session, employer: Employer, label: str) -> None:
    vacancy = make_vacancy(db_session, employer)

    with pytest.raises(IntegrityError, match="label_not_blank"):
        requirement(db_session, vacancy, kind=RequirementKind.OTHER, label=label)


def test_a_used_skill_cannot_be_deleted(db_session: Session, employer: Employer) -> None:
    vacancy = make_vacancy(db_session, employer)
    skill = db_session.scalars(select(Skill)).first()
    assert skill is not None
    requirement(db_session, vacancy, kind=RequirementKind.SKILL, label="Python", skill_id=skill.id)

    with pytest.raises(IntegrityError, match="fk_vacancy_requirements_skill_id_skills"):
        db_session.execute(delete(Skill).where(Skill.id == skill.id))


# ---------- search vector ----------


def matches(db: Session, query: str) -> list[str]:
    return list(
        db.scalars(
            select(Vacancy.title)
            .where(Vacancy.search_vector.op("@@")(func.websearch_to_tsquery("english", query)))
            .order_by(Vacancy.title)
        )
    )


def test_the_search_vector_is_filled_from_title_and_description(
    db_session: Session, employer: Employer
) -> None:
    make_vacancy(
        db_session,
        employer,
        title="Accounts Assistant",
        description="Prepare invoices and reconcile bank statements.",
    )
    make_vacancy(db_session, employer, title="Driver", description="Deliver juice crates.")

    assert matches(db_session, "accounts") == ["Accounts Assistant"]
    assert matches(db_session, "invoices") == ["Accounts Assistant"]
    assert matches(db_session, "juice") == ["Driver"]
    assert matches(db_session, "pilot") == []


def test_the_search_uses_english_word_forms(db_session: Session, employer: Employer) -> None:
    make_vacancy(db_session, employer, title="Cashier", description="Handling payments daily.")

    assert matches(db_session, "payment") == ["Cashier"]
    assert matches(db_session, "handle") == ["Cashier"]


def test_title_matches_outrank_description_matches(db_session: Session, employer: Employer) -> None:
    make_vacancy(db_session, employer, title="Tailor", description="Sewing uniforms.")
    make_vacancy(db_session, employer, title="Sewing machine operator", description="Factory.")

    ranked = db_session.scalars(
        select(Vacancy.title)
        .where(Vacancy.search_vector.op("@@")(func.websearch_to_tsquery("english", "sewing")))
        .order_by(
            func.ts_rank(
                Vacancy.search_vector, func.websearch_to_tsquery("english", "sewing")
            ).desc()
        )
    ).all()

    assert ranked == ["Sewing machine operator", "Tailor"]


def test_the_vector_follows_edits_and_handles_a_missing_description(
    db_session: Session, employer: Employer
) -> None:
    vacancy = make_vacancy(db_session, employer, title="Cook", description=None)
    assert matches(db_session, "cook") == ["Cook"]

    vacancy.title = "Chef"
    vacancy.description = "Prepare meals"
    db_session.flush()

    assert matches(db_session, "cook") == []
    assert matches(db_session, "chef") == ["Chef"]
    assert matches(db_session, "meals") == ["Chef"]


def test_the_vector_is_not_writable_and_has_a_gin_index(
    db_session: Session, employer: Employer
) -> None:
    vacancy = make_vacancy(db_session, employer)

    with pytest.raises(Exception, match="generated"):
        db_session.execute(
            text("update vacancies set search_vector = to_tsvector('x') where id = :i"),
            {"i": vacancy.id},
        )
    db_session.rollback()


def test_there_is_a_gin_index_on_the_vector(db_session: Session) -> None:
    definition = db_session.scalar(
        text("select indexdef from pg_indexes where indexname = 'ix_vacancies_search_vector'")
    )

    assert definition is not None and "USING gin" in definition


def test_there_is_a_partial_index_for_the_newest_first_list(db_session: Session) -> None:
    definition = db_session.scalar(
        text("select indexdef from pg_indexes where indexname = 'ix_vacancies_newest_published'")
    )

    assert definition is not None
    assert "published_at DESC" in definition and "WHERE" in definition and "published" in definition

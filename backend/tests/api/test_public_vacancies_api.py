"""Public vacancy search and detail."""

from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    ApplicationMethod,
    District,
    Employer,
    EmploymentType,
    QualificationLevel,
    RequirementKind,
    Vacancy,
    VacancyRequirement,
    VacancyStatus,
    VerificationStatus,
    WorkArrangement,
)
from tests.api.auth_helpers import error_code
from tests.api.profile_helpers import login_as
from tests.api.vacancy_helpers import World, make_company, make_world

VACANCIES = "/api/v1/vacancies"
NOW = datetime.now(UTC)

CARD_KEYS = {
    "id",
    "title",
    "company_name",
    "company_logo_url",
    "district_id",
    "district_name",
    "employment_type",
    "work_arrangement",
    "published_at",
    "expires_at",
    "salary_min",
    "salary_max",
}


@pytest.fixture
def world(db_session: Session) -> World:
    return make_world(db_session)


@pytest.fixture
def company(db_session: Session, world: World) -> Employer:
    return make_company(db_session, world)


def add(db: Session, company: Employer, world: World, **overrides: Any) -> Vacancy:
    """A live vacancy unless told otherwise."""
    published_at = overrides.pop("published_at", NOW - timedelta(days=1))
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
    db.flush()
    return vacancy


def get(client: TestClient, **params: Any):
    return client.get(VACANCIES, params=params)


def titles(response: Any) -> list[str]:
    return [item["title"] for item in response.json()["data"]]


# ---------- what is visible ----------


def test_only_live_vacancies_are_listed(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(db_session, company, world, title="Live job")
    add(db_session, company, world, title="Draft job", status=VacancyStatus.DRAFT)
    add(db_session, company, world, title="Closed job", status=VacancyStatus.CLOSED)
    add(
        db_session,
        company,
        world,
        title="Expired job",
        published_at=NOW - timedelta(days=60),
        expires_at=NOW - timedelta(minutes=1),
    )

    response = get(client)

    assert response.status_code == 200
    assert titles(response) == ["Live job"]
    assert response.json()["meta"] == {"page": 1, "page_size": 20, "total": 1}


def test_a_vacancy_that_has_just_expired_disappears(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(db_session, company, world, title="Soon", expires_at=NOW + timedelta(minutes=5))
    add(db_session, company, world, title="Gone", expires_at=NOW - timedelta(seconds=30))

    assert titles(get(client)) == ["Soon"]


@pytest.mark.parametrize(
    "status",
    [
        VerificationStatus.PENDING,
        VerificationStatus.SUSPENDED,
        VerificationStatus.REJECTED,
    ],
)
def test_suspending_a_company_does_not_hide_what_is_already_live(
    client: TestClient, db_session: Session, world: World, status: VerificationStatus
) -> None:
    company = make_company(db_session, world, status=status)
    add(db_session, company, world, title="Already live")

    assert titles(get(client)) == ["Already live"]


def test_nobody_needs_to_log_in(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(db_session, company, world)

    anonymous = get(client)
    login_as(client, "boss@example.com")
    logged_in = get(client)

    assert anonymous.status_code == logged_in.status_code == 200
    assert anonymous.json()["data"] == logged_in.json()["data"]


def test_a_card_holds_only_what_a_list_needs(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(db_session, company, world, title="Accounts Assistant")

    (card,) = get(client).json()["data"]

    assert set(card) == CARD_KEYS
    assert card["company_name"] == "Ssese Foods Ltd"
    assert card["district_name"] == "Gulu"
    assert card["employment_type"] == "full_time" and card["work_arrangement"] == "onsite"
    assert "description" not in card and "external_url" not in card and "status" not in card


def test_a_remote_vacancy_has_no_district(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(
        db_session,
        company,
        world,
        work_arrangement=WorkArrangement.REMOTE,
        district_id=None,
    )

    (card,) = get(client).json()["data"]

    assert card["district_id"] is None and card["district_name"] is None


@pytest.mark.parametrize(
    ("show", "expected"), [(True, (800_000, 1_200_000)), (False, (None, None))]
)
def test_the_salary_is_shown_only_when_the_employer_chose_to(
    client: TestClient,
    db_session: Session,
    company: Employer,
    world: World,
    show: bool,
    expected: tuple[int | None, int | None],
) -> None:
    vacancy = add(
        db_session, company, world, salary_min=800_000, salary_max=1_200_000, show_salary=show
    )

    (card,) = get(client).json()["data"]
    detail = client.get(f"{VACANCIES}/{vacancy.id}").json()["data"]

    assert (card["salary_min"], card["salary_max"]) == expected
    assert (detail["salary_min"], detail["salary_max"]) == expected


# ---------- filters ----------


@pytest.fixture
def mixed(db_session: Session, company: Employer, world: World) -> dict[str, Vacancy]:
    other_company = make_company(db_session, world, "other@example.com", name="Mbarara Dairy")
    return {
        "gulu_ft": add(db_session, company, world, title="Gulu full time"),
        "mbarara_pt": add(
            db_session,
            other_company,
            world,
            title="Mbarara part time",
            employment_type=EmploymentType.PART_TIME,
            district_id=world.other_district.id,
        ),
        "remote_contract": add(
            db_session,
            company,
            world,
            title="Remote contract",
            employment_type=EmploymentType.CONTRACT,
            work_arrangement=WorkArrangement.REMOTE,
            district_id=None,
        ),
        "hybrid_gulu": add(
            db_session,
            company,
            world,
            title="Hybrid Gulu",
            work_arrangement=WorkArrangement.HYBRID,
        ),
    }


def test_filter_by_district(client: TestClient, mixed: dict[str, Vacancy], world: World) -> None:
    assert sorted(titles(get(client, district_id=str(world.district.id)))) == [
        "Gulu full time",
        "Hybrid Gulu",
    ]
    assert titles(get(client, district_id=str(world.other_district.id))) == ["Mbarara part time"]


def test_filter_by_employment_type(client: TestClient, mixed: dict[str, Vacancy]) -> None:
    assert titles(get(client, employment_type="part_time")) == ["Mbarara part time"]
    assert titles(get(client, employment_type="contract")) == ["Remote contract"]
    assert get(client, employment_type="internship").json()["data"] == []


def test_filter_by_work_arrangement(client: TestClient, mixed: dict[str, Vacancy]) -> None:
    assert titles(get(client, work_arrangement="remote")) == ["Remote contract"]
    assert titles(get(client, work_arrangement="hybrid")) == ["Hybrid Gulu"]
    assert len(get(client, work_arrangement="onsite").json()["data"]) == 2


def test_filters_combine_with_and(
    client: TestClient, mixed: dict[str, Vacancy], world: World
) -> None:
    both = get(
        client,
        district_id=str(world.district.id),
        employment_type="full_time",
        work_arrangement="hybrid",
    )
    nothing = get(client, district_id=str(world.other_district.id), employment_type="contract")

    assert titles(both) == ["Hybrid Gulu"]
    assert nothing.json()["data"] == []
    assert nothing.json()["meta"]["total"] == 0


def test_filter_by_qualification_level_keeps_vacancies_at_or_below_it(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    certificate = QualificationLevel(name="Certificate", rank=1)
    diploma = QualificationLevel(name="Diploma", rank=2)
    db_session.add_all([certificate, diploma])
    db_session.flush()
    add(db_session, company, world, title="Asks for nothing")
    add(
        db_session,
        company,
        world,
        title="Certificate job",
        min_qualification_level_id=certificate.id,
    )
    add(db_session, company, world, title="Diploma job", min_qualification_level_id=diploma.id)
    add(db_session, company, world, title="Degree job", min_qualification_level_id=world.level.id)

    def seen(level: QualificationLevel) -> list[str]:
        return sorted(titles(get(client, qualification_level_id=str(level.id))))

    assert seen(certificate) == ["Asks for nothing", "Certificate job"]
    assert seen(diploma) == ["Asks for nothing", "Certificate job", "Diploma job"]
    assert seen(world.level) == ["Asks for nothing", "Certificate job", "Degree job", "Diploma job"]


def test_every_filter_together(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(db_session, company, world, title="Match accountant", description="Books and accounts.")
    add(
        db_session,
        company,
        world,
        title="Wrong district accountant",
        district_id=world.other_district.id,
    )
    add(
        db_session,
        company,
        world,
        title="Wrong type accountant",
        employment_type=EmploymentType.CONTRACT,
    )
    add(db_session, company, world, title="No words here", description="Nothing relevant.")

    response = get(
        client,
        q="accountant",
        district_id=str(world.district.id),
        qualification_level_id=str(world.level.id),
        employment_type="full_time",
        work_arrangement="onsite",
    )

    assert titles(response) == ["Match accountant"]


# ---------- keyword search ----------


def test_search_matches_title_and_description_with_word_forms(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(db_session, company, world, title="Cashier", description="Handling payments daily.")
    add(db_session, company, world, title="Driver", description="Deliver juice crates.")

    assert titles(get(client, q="payment")) == ["Cashier"]
    assert titles(get(client, q="delivering")) == ["Driver"]
    assert titles(get(client, q="pilot")) == []


def test_title_matches_rank_above_description_matches(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(
        db_session,
        company,
        world,
        title="Tailor",
        description="Sewing uniforms.",
        published_at=NOW - timedelta(hours=1),
    )
    add(
        db_session,
        company,
        world,
        title="Sewing machine operator",
        description="Factory.",
        published_at=NOW - timedelta(days=5),
    )

    response = get(client, q="sewing")

    assert titles(response) == ["Sewing machine operator", "Tailor"]


def test_a_search_never_returns_hidden_vacancies(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(db_session, company, world, title="Baker live")
    add(db_session, company, world, title="Baker draft", status=VacancyStatus.DRAFT)
    add(db_session, company, world, title="Baker closed", status=VacancyStatus.CLOSED)
    add(
        db_session,
        company,
        world,
        title="Baker expired",
        published_at=NOW - timedelta(days=40),
        expires_at=NOW - timedelta(days=1),
    )

    response = get(client, q="baker")

    assert titles(response) == ["Baker live"]
    assert response.json()["meta"]["total"] == 1


@pytest.mark.parametrize(
    "query",
    [
        "'; DROP TABLE vacancies; --",
        '"unbalanced quote',
        "((( ))) &&& |||",
        "a & b | !c",
        "<script>alert(1)</script>",
        "%%%",
        "\\",
        "ünïcödé 简历",
        "   ",
        "the",  # only a stop word
    ],
)
def test_odd_search_text_never_causes_an_error(
    client: TestClient, db_session: Session, company: Employer, world: World, query: str
) -> None:
    add(db_session, company, world)

    response = get(client, q=query)

    assert response.status_code == 200, query
    assert set(response.json()) == {"data", "meta"}


def test_web_search_syntax_works(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(db_session, company, world, title="Chef", description="Prepare meals in a busy kitchen.")
    add(db_session, company, world, title="Cook", description="Prepare meals at a school.")

    assert sorted(titles(get(client, q="meals"))) == ["Chef", "Cook"]
    assert titles(get(client, q="meals -school")) == ["Chef"]
    assert titles(get(client, q='"busy kitchen"')) == ["Chef"]
    assert sorted(titles(get(client, q="chef or cook"))) == ["Chef", "Cook"]


def test_a_blank_search_is_the_same_as_no_search(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(db_session, company, world, title="One")
    add(db_session, company, world, title="Two")

    assert get(client, q="   ").json() == get(client).json()


# ---------- sorting ----------


@pytest.fixture
def five_by_age(db_session: Session, company: Employer, world: World) -> None:
    for days in (5, 1, 3, 2, 4):
        add(
            db_session,
            company,
            world,
            title=f"Job {days} days old",
            published_at=NOW - timedelta(days=days),
            expires_at=NOW + timedelta(days=30),
        )


def test_newest_first_by_default(client: TestClient, five_by_age: None) -> None:
    assert titles(get(client)) == [f"Job {d} days old" for d in (1, 2, 3, 4, 5)]


def test_the_sort_can_be_asked_for_explicitly(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    add(
        db_session,
        company,
        world,
        title="Old tailor",
        description="Tailor tailor tailor.",
        published_at=NOW - timedelta(days=9),
    )
    add(
        db_session,
        company,
        world,
        title="Fresh",
        description="A tailor wanted.",
        published_at=NOW - timedelta(hours=1),
    )

    relevance = get(client, q="tailor", sort="relevance")
    newest = get(client, q="tailor", sort="newest")

    assert titles(relevance)[0] == "Old tailor"
    assert titles(newest) == ["Fresh", "Old tailor"]


def test_relevance_without_a_search_means_newest(client: TestClient, five_by_age: None) -> None:
    assert titles(get(client, sort="relevance")) == titles(get(client))


def test_equal_dates_have_a_stable_order(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    same = NOW - timedelta(days=1)
    for number in range(6):
        add(db_session, company, world, title=f"Same {number}", published_at=same)

    first = titles(get(client, page_size=3))
    second = titles(get(client, page=2, page_size=3))
    everything = titles(get(client))

    assert first + second == everything
    assert len(set(everything)) == 6


# ---------- paging ----------


def test_paging_boundaries(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    for number in range(5):
        add(
            db_session,
            company,
            world,
            title=f"Job {number}",
            published_at=NOW - timedelta(days=number + 1),
        )

    first = get(client, page=1, page_size=2)
    last = get(client, page=3, page_size=2)
    beyond = get(client, page=4, page_size=2)
    exact = get(client, page=1, page_size=5)

    assert titles(first) == ["Job 0", "Job 1"]
    assert titles(last) == ["Job 4"]
    assert beyond.json() == {"data": [], "meta": {"page": 4, "page_size": 2, "total": 5}}
    assert len(exact.json()["data"]) == 5 and exact.json()["meta"]["total"] == 5
    assert first.json()["meta"] == {"page": 1, "page_size": 2, "total": 5}


def test_the_largest_page_size_is_fifty(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    for number in range(52):
        add(db_session, company, world, title=f"Job {number}")

    fifty = get(client, page_size=50)

    assert fifty.status_code == 200
    assert len(fifty.json()["data"]) == 50 and fifty.json()["meta"]["total"] == 52
    assert len(get(client).json()["data"]) == 20
    assert len(get(client, page=2, page_size=50).json()["data"]) == 2


def test_an_empty_list_is_a_normal_answer(client: TestClient) -> None:
    assert get(client).json() == {"data": [], "meta": {"page": 1, "page_size": 20, "total": 0}}


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page": -1},
        {"page": "x"},
        {"page": 100_001},
        {"page_size": 0},
        {"page_size": 51},
        {"page_size": "x"},
        {"q": "x" * 201},
        {"employment_type": "gig"},
        {"work_arrangement": "orbital"},
        {"sort": "cheapest"},
        {"district_id": "not-a-uuid"},
        {"qualification_level_id": "not-a-uuid"},
        {"district_id": "3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10"},
        {"qualification_level_id": "3f1c8a7e-5f4e-4a39-8d3b-0b6f7f8f9a10"},
    ],
)
def test_bad_parameters_are_422_in_the_error_envelope(
    client: TestClient, params: dict[str, Any]
) -> None:
    response = get(client, **params)

    assert response.status_code == 422, params
    assert error_code(response) == "validation_error"
    assert set(response.json()) == {"error"}


def test_a_search_of_two_hundred_characters_is_fine(client: TestClient) -> None:
    assert get(client, q="a" * 200).status_code == 200


# ---------- detail ----------


def test_the_detail_of_a_live_vacancy(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    vacancy = add(
        db_session,
        company,
        world,
        title="Accounts Assistant",
        description="Prepare invoices and reconcile accounts.",
        min_qualification_level_id=world.level.id,
        min_experience_years=2,
        salary_min=800_000,
        salary_max=1_200_000,
        show_salary=True,
    )
    db_session.add_all(
        [
            VacancyRequirement(
                vacancy_id=vacancy.id,
                kind=RequirementKind.SKILL,
                skill_id=world.excel.id,
                label="Microsoft Excel",
                is_mandatory=True,
            ),
            VacancyRequirement(
                vacancy_id=vacancy.id,
                kind=RequirementKind.CERTIFICATION,
                label="CPA Part 1",
                is_mandatory=False,
            ),
        ]
    )
    db_session.flush()

    response = client.get(f"{VACANCIES}/{vacancy.id}")

    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["title"] == "Accounts Assistant"
    assert data["description"] == "Prepare invoices and reconcile accounts."
    assert data["employment_type"] == "full_time" and data["work_arrangement"] == "onsite"
    assert data["district_name"] == "Gulu"
    assert data["min_qualification_level_name"] == "Bachelor's degree"
    assert data["min_experience_years"] == 2
    assert data["application_method"] == "internal" and data["external_url"] is None
    assert data["employer"] == {
        "company_name": "Ssese Foods Ltd",
        "district_name": "Gulu",
        "logo_url": None,
    }
    flags = {item["label"]: item["is_mandatory"] for item in data["requirements"]}
    assert flags == {"Microsoft Excel": True, "CPA Part 1": False}
    assert [item["is_mandatory"] for item in data["requirements"]] == [True, False]


def test_the_detail_has_no_contact_data_or_internal_fields(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    vacancy = add(db_session, company, world, created_by_admin=True)

    text = client.get(f"{VACANCIES}/{vacancy.id}").text

    for secret in (
        "boss@example.com",
        "+256414123456",  # the company's contact phone
        "80020012345678",  # its registration number
        "created_by_admin",
        "employer_id",
        "owner_user_id",
        "verification_status",
        "search_vector",
        '"status"',
    ):
        assert secret not in text, secret


def test_an_external_vacancy_shows_where_to_apply(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    vacancy = add(
        db_session,
        company,
        world,
        application_method=ApplicationMethod.EXTERNAL,
        external_url="https://jobs.example.com/12",
    )

    data = client.get(f"{VACANCIES}/{vacancy.id}").json()["data"]

    assert data["application_method"] == "external"
    assert data["external_url"] == "https://jobs.example.com/12"


@pytest.mark.parametrize("status", [VacancyStatus.DRAFT, VacancyStatus.CLOSED])
def test_a_vacancy_that_is_not_published_is_404(
    client: TestClient, db_session: Session, company: Employer, world: World, status: VacancyStatus
) -> None:
    vacancy = add(db_session, company, world, status=status)

    response = client.get(f"{VACANCIES}/{vacancy.id}")

    assert response.status_code == 404
    assert error_code(response) == "vacancy_not_found"


def test_an_expired_vacancy_is_404(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    vacancy = add(
        db_session,
        company,
        world,
        published_at=NOW - timedelta(days=50),
        expires_at=NOW - timedelta(minutes=1),
    )

    assert client.get(f"{VACANCIES}/{vacancy.id}").status_code == 404


def test_the_owner_gets_404_for_their_own_draft_on_the_public_route_too(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    draft = add(db_session, company, world, status=VacancyStatus.DRAFT)
    login_as(client, "boss@example.com")

    assert client.get(f"{VACANCIES}/{draft.id}").status_code == 404


def test_unknown_and_malformed_ids(client: TestClient) -> None:
    unknown = client.get(f"{VACANCIES}/{uuid4()}")

    assert unknown.status_code == 404 and error_code(unknown) == "vacancy_not_found"
    assert client.get(f"{VACANCIES}/not-a-uuid").status_code == 422


def test_the_public_district_is_the_companys_even_for_a_remote_job(
    client: TestClient, db_session: Session, company: Employer, world: World
) -> None:
    vacancy = add(
        db_session, company, world, work_arrangement=WorkArrangement.REMOTE, district_id=None
    )

    data = client.get(f"{VACANCIES}/{vacancy.id}").json()["data"]

    assert data["district_name"] is None
    assert data["employer"]["district_name"] == "Gulu"


def test_the_public_routes_are_read_only(client: TestClient) -> None:
    for method in (client.post, client.put, client.delete, client.patch):
        assert method(VACANCIES).status_code in (401, 403, 405, 422)
    assert client.post(f"{VACANCIES}/{uuid4()}/publish").status_code == 404


def test_the_openapi_lists_the_two_public_operations(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert {
        p: sorted(m)
        for p, m in paths.items()
        if p.startswith("/api/v1/vacancies") and not p.endswith(("/reports", "/applications"))
    } == {
        "/api/v1/vacancies": ["get"],
        "/api/v1/vacancies/{vacancy_id}": ["get"],
        "/api/v1/vacancies/{vacancy_id}/logo": ["get"],
    }


def test_districts_in_the_fixture_are_real(db_session: Session, world: World) -> None:
    assert db_session.get(District, world.district.id) is not None

"""Vacancy rules that depend on the clock, checked with a fixed "now"."""

from datetime import UTC, datetime, timedelta

import pytest

from app.models import Vacancy, VacancyStatus
from app.schemas.vacancy import VacancyIn
from app.services.vacancies import MAX_LIFETIME, _check_publishable, is_live

NOW = datetime(2026, 11, 6, 9, 0, tzinfo=UTC)


def vacancy(status: VacancyStatus, expires_at: datetime | None) -> Vacancy:
    return Vacancy(title="Job", status=status, expires_at=expires_at)


@pytest.mark.parametrize(
    ("status", "expires_at", "live"),
    [
        (VacancyStatus.PUBLISHED, NOW + timedelta(seconds=1), True),
        (VacancyStatus.PUBLISHED, NOW, False),  # expires at this very moment: no longer live
        (VacancyStatus.PUBLISHED, NOW - timedelta(seconds=1), False),
        (VacancyStatus.PUBLISHED, None, False),
        (VacancyStatus.DRAFT, NOW + timedelta(days=5), False),
        (VacancyStatus.CLOSED, NOW + timedelta(days=5), False),
    ],
)
def test_live_means_published_and_not_expired(
    status: VacancyStatus, expires_at: datetime | None, live: bool
) -> None:
    assert is_live(vacancy(status, expires_at), NOW) is live


def complete(**overrides: object) -> VacancyIn:
    values: dict[str, object] = {
        "title": "Job",
        "description": "Do things.",
        "employment_type": "full_time",
        "work_arrangement": "remote",
        "expires_at": NOW + timedelta(days=10),
    }
    values.update(overrides)
    return VacancyIn.model_validate(values)


def problems(data: VacancyIn, published_at: datetime = NOW) -> set[str]:
    return set(_check_publishable(data, published_at=published_at, now=NOW))


def test_a_complete_vacancy_has_no_problems() -> None:
    assert problems(complete()) == set()


def test_the_expiry_boundaries() -> None:
    assert problems(complete(expires_at=NOW)) == {"expires_at"}
    assert problems(complete(expires_at=NOW + timedelta(seconds=1))) == set()
    assert problems(complete(expires_at=NOW + MAX_LIFETIME)) == set()
    assert problems(complete(expires_at=NOW + MAX_LIFETIME + timedelta(seconds=1))) == {
        "expires_at"
    }


def test_the_ninety_days_count_from_publishing_not_from_today() -> None:
    published = NOW - timedelta(days=60)

    assert problems(complete(expires_at=NOW + timedelta(days=29)), published) == set()
    assert problems(complete(expires_at=NOW + timedelta(days=31)), published) == {"expires_at"}


def test_an_external_link_is_needed_only_for_external_vacancies() -> None:
    assert problems(complete(application_method="external")) == {"external_url"}
    assert (
        problems(complete(application_method="external", external_url="https://x.example.com"))
        == set()
    )
    assert problems(complete(application_method="internal")) == set()


def test_onsite_and_hybrid_need_a_district_but_remote_does_not() -> None:
    assert problems(complete(work_arrangement="remote")) == set()
    assert problems(complete(work_arrangement="onsite")) == {"district_id"}
    assert problems(complete(work_arrangement="hybrid")) == {"district_id"}

"""The demo data seed: development only, and it only touches its own rows."""

import importlib.util
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Employer,
    User,
    UserRole,
    Vacancy,
    VacancyRequirement,
    VacancyStatus,
    VerificationStatus,
)
from app.services.demo_seed import (
    DEMO_EMAIL_DOMAIN,
    DemoSeedError,
    ensure_allowed,
    has_demo,
    reset_demo,
    seed_demo,
)
from app.services.vacancies import live_clause
from tests.api.vacancy_helpers import World, make_company, make_world

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "seed_demo.py"


def load_script():
    spec = importlib.util.spec_from_file_location("seed_demo_script", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["seed_demo_script"] = module
    spec.loader.exec_module(module)
    return module


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


@pytest.fixture
def reference(db_session: Session) -> World:
    return make_world(db_session)


# ---------- the environment guard ----------


@pytest.mark.parametrize("env", ["development", "test"])
def test_it_is_allowed_in_development_and_test(env: str) -> None:
    ensure_allowed(env)


@pytest.mark.parametrize("env", ["production", "staging", "", "Production"])
def test_it_refuses_everywhere_else(env: str) -> None:
    with pytest.raises(DemoSeedError, match="development only"):
        ensure_allowed(env)


# ---------- seeding ----------


def test_it_needs_reference_data_first(db_session: Session) -> None:
    with pytest.raises(DemoSeedError, match="reference data"):
        seed_demo(db_session)

    assert count(db_session, Vacancy) == 0


def test_it_creates_approved_companies_and_a_varied_set_of_vacancies(
    db_session: Session, reference: None
) -> None:
    result = seed_demo(db_session, employers=5, vacancies=300)

    assert (result.employers, result.vacancies) == (5, 300)
    assert count(db_session, Employer) == 5 and count(db_session, Vacancy) == 300
    statuses = set(db_session.scalars(select(Employer.verification_status)))
    assert statuses == {VerificationStatus.APPROVED}
    assert result.live + result.expired + result.drafts + result.closed == 300
    assert min(result.live, result.expired, result.drafts, result.closed) > 0


def test_the_counts_match_what_the_public_sees(db_session: Session, reference: None) -> None:
    result = seed_demo(db_session, employers=4, vacancies=400)

    live = db_session.scalar(select(func.count()).select_from(Vacancy).where(live_clause()))
    published = db_session.scalar(
        select(func.count()).select_from(Vacancy).where(Vacancy.status == VacancyStatus.PUBLISHED)
    )

    assert live == result.live
    assert published == result.live + result.expired  # expired ones are still marked published


def test_every_row_satisfies_the_database_rules(db_session: Session, reference: None) -> None:
    # The CHECK constraints (complete when published, 90 days, salary order, https...) would raise.
    seed_demo(db_session, employers=3, vacancies=500)

    assert count(db_session, Vacancy) == 500
    assert count(db_session, VacancyRequirement) > 0


def test_remote_vacancies_have_no_district_and_some_salaries_are_shown(
    db_session: Session, reference: None
) -> None:
    seed_demo(db_session, vacancies=300)

    remote_districts = db_session.scalars(
        select(Vacancy.district_id).where(Vacancy.work_arrangement == "remote")
    ).all()
    shown = db_session.scalar(
        select(func.count()).select_from(Vacancy).where(Vacancy.show_salary.is_(True))
    )

    assert remote_districts and all(item is None for item in remote_districts)
    assert shown and shown > 0


def test_the_same_seed_gives_the_same_data_and_another_seed_differs(
    db_session: Session, reference: None
) -> None:
    def titles() -> list[str]:
        return sorted(db_session.scalars(select(Vacancy.title)))

    seed_demo(db_session, employers=3, vacancies=60, rng_seed=7)
    first = titles()
    reset_demo(db_session)
    seed_demo(db_session, employers=3, vacancies=60, rng_seed=7)
    again = titles()
    reset_demo(db_session)
    seed_demo(db_session, employers=3, vacancies=60, rng_seed=8)

    assert first == again
    assert titles() != first


def test_running_it_twice_is_refused_not_doubled(db_session: Session, reference: None) -> None:
    seed_demo(db_session, vacancies=20)

    with pytest.raises(DemoSeedError, match="--reset"):
        seed_demo(db_session, vacancies=20)

    assert count(db_session, Vacancy) == 20


# ---------- reset ----------


def test_reset_removes_only_demo_rows(db_session: Session, reference: World) -> None:
    real_company = make_company(db_session, reference, "real@example.com", name="Real Company Ltd")
    seed_demo(db_session, employers=3, vacancies=50)
    assert has_demo(db_session)

    removed = reset_demo(db_session)

    assert removed == 3
    assert not has_demo(db_session)
    assert count(db_session, Vacancy) == 0 and count(db_session, VacancyRequirement) == 0
    assert db_session.get(Employer, real_company.id) is not None
    assert list(db_session.scalars(select(User.email))) == ["real@example.com"]


def test_reset_with_nothing_to_remove_is_fine(db_session: Session) -> None:
    assert reset_demo(db_session) == 0


def test_demo_users_cannot_log_in_and_use_the_demo_domain(
    db_session: Session, reference: None
) -> None:
    seed_demo(db_session, employers=2, vacancies=10)

    users = list(db_session.scalars(select(User)))

    assert len(users) == 2
    for user in users:
        assert user.role == UserRole.EMPLOYER
        assert user.password_hash is None
        assert user.email.endswith(f"@{DEMO_EMAIL_DOMAIN}")


# ---------- the command-line script ----------


@contextmanager
def factory_for(db: Session) -> Iterator[Session]:
    yield db


def test_the_script_refuses_in_production_and_changes_nothing(
    db_session: Session, reference: None, capsys: pytest.CaptureFixture[str]
) -> None:
    script = load_script()

    code = script.main([], app_env="production", session_factory=lambda: factory_for(db_session))

    assert code == 1
    assert "development only" in capsys.readouterr().err
    assert count(db_session, Vacancy) == 0


def test_the_script_creates_demo_data(
    db_session: Session, reference: None, capsys: pytest.CaptureFixture[str]
) -> None:
    script = load_script()

    code = script.main(
        ["--vacancies", "40", "--employers", "3"],
        app_env="development",
        session_factory=lambda: factory_for(db_session),
    )

    assert code == 0
    assert "Created 3 demo companies and 40 vacancies" in capsys.readouterr().out
    assert count(db_session, Vacancy) == 40


def test_the_script_reset_flag_replaces_the_data(
    db_session: Session, reference: None, capsys: pytest.CaptureFixture[str]
) -> None:
    script = load_script()
    args = ["--vacancies", "30", "--employers", "2"]
    factory = lambda: factory_for(db_session)  # noqa: E731

    assert script.main(args, app_env="development", session_factory=factory) == 0
    assert script.main(args, app_env="development", session_factory=factory) == 1
    assert "--reset" in capsys.readouterr().err
    assert script.main([*args, "--reset"], app_env="development", session_factory=factory) == 0

    assert count(db_session, Vacancy) == 30 and count(db_session, Employer) == 2


@pytest.mark.parametrize(
    "args", [["--vacancies", "0"], ["--vacancies", "100001"], ["--employers", "0"]]
)
def test_the_script_rejects_silly_numbers(
    db_session: Session, args: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    script = load_script()

    with pytest.raises(SystemExit) as stopped:
        script.main(args, app_env="development", session_factory=lambda: factory_for(db_session))

    assert stopped.value.code == 2

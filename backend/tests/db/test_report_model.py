"""The database enforces the report rules itself."""

from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import normalise_email
from app.models import (
    ReportReason,
    ReportStatus,
    User,
    UserRole,
    Vacancy,
    VacancyReport,
)
from tests.api.vacancy_helpers import add_vacancy, make_company, make_world


@pytest.fixture
def vacancy(db_session: Session) -> Vacancy:
    world = make_world(db_session)
    return add_vacancy(db_session, make_company(db_session, world), world)


def make_user(db: Session, email: str) -> User:
    user = User(email=email, email_normalized=normalise_email(email), role=UserRole.JOB_SEEKER)
    db.add(user)
    db.flush()
    return user


def make_report(db: Session, vacancy: Vacancy, user: User | None, **extra: object) -> VacancyReport:
    report = VacancyReport(
        vacancy_id=vacancy.id,
        reporter_user_id=user.id if user else None,
        reason=ReportReason.SCAM_OR_FEE,
        **extra,
    )
    db.add(report)
    db.flush()
    return report


def test_defaults(db_session: Session, vacancy: Vacancy) -> None:
    report = make_report(db_session, vacancy, make_user(db_session, "a@example.com"))
    db_session.refresh(report)

    assert report.status == ReportStatus.OPEN
    assert (
        report.details is None and report.handled_by_user_id is None and report.handled_at is None
    )
    assert report.created_at.tzinfo is not None


def test_one_open_report_per_person_per_vacancy(db_session: Session, vacancy: Vacancy) -> None:
    user = make_user(db_session, "a@example.com")
    make_report(db_session, vacancy, user)

    with pytest.raises(IntegrityError, match="uq_vacancy_reports_vacancy_reporter_open"):
        make_report(db_session, vacancy, user)


def test_a_handled_report_does_not_block_a_new_one(db_session: Session, vacancy: Vacancy) -> None:
    user = make_user(db_session, "a@example.com")
    first = make_report(db_session, vacancy, user)
    first.status = ReportStatus.DISMISSED
    db_session.flush()

    make_report(db_session, vacancy, user)
    make_report(db_session, vacancy, user, status=ReportStatus.ACTIONED)

    assert db_session.scalar(select(func.count()).select_from(VacancyReport)) == 3


def test_different_people_can_each_report(db_session: Session, vacancy: Vacancy) -> None:
    make_report(db_session, vacancy, make_user(db_session, "a@example.com"))
    make_report(db_session, vacancy, make_user(db_session, "b@example.com"))


def test_reports_from_erased_accounts_are_not_limited(
    db_session: Session, vacancy: Vacancy
) -> None:
    make_report(db_session, vacancy, None)
    make_report(db_session, vacancy, None)


@pytest.mark.parametrize(("column", "value"), [("reason", "spam"), ("status", "archived")])
def test_reason_and_status_are_checked(
    db_session: Session, vacancy: Vacancy, column: str, value: str
) -> None:
    report = make_report(db_session, vacancy, make_user(db_session, "a@example.com"))

    with pytest.raises(IntegrityError, match="ck_vacancy_reports_"):
        db_session.execute(
            text(f"update vacancy_reports set {column} = :v where id = :i"),  # noqa: S608
            {"v": value, "i": report.id},
        )


def test_a_report_is_about_an_existing_vacancy(db_session: Session) -> None:
    with pytest.raises(IntegrityError, match="fk_vacancy_reports_vacancy_id_vacancies"):
        db_session.add(VacancyReport(vacancy_id=uuid4(), reason=ReportReason.OTHER))
        db_session.flush()


def test_deleting_the_vacancy_removes_its_reports(db_session: Session, vacancy: Vacancy) -> None:
    make_report(db_session, vacancy, make_user(db_session, "a@example.com"))

    db_session.execute(delete(Vacancy).where(Vacancy.id == vacancy.id))

    assert db_session.scalar(select(func.count()).select_from(VacancyReport)) == 0


def test_deleting_a_user_keeps_their_reports_without_a_name(
    db_session: Session, vacancy: Vacancy
) -> None:
    reporter = make_user(db_session, "a@example.com")
    admin = make_user(db_session, "admin@example.com")
    report = make_report(db_session, vacancy, reporter, handled_by_user_id=admin.id)

    db_session.execute(delete(User).where(User.id.in_([reporter.id, admin.id])))
    db_session.refresh(report)

    assert report.reporter_user_id is None and report.handled_by_user_id is None

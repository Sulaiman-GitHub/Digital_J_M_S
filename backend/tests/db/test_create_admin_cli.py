"""scripts/create_admin.py, driven as a function: fake prompt, test database, no real input."""

import importlib.util
from collections.abc import Iterator
from contextlib import nullcontext
from pathlib import Path
from types import ModuleType

import pytest
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security import hash_password, normalise_email
from app.models import User, UserRole
from app.services.admin_setup import find_user

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "create_admin.py"
STRONG = "Rwenzori-Peaks-2026"


@pytest.fixture(scope="module")
def cli() -> ModuleType:
    spec = importlib.util.spec_from_file_location("create_admin", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakePrompt:
    """Stands in for getpass: returns scripted answers and records what was asked."""

    def __init__(self, *answers: str) -> None:
        self.answers = list(answers)
        self.questions: list[str] = []

    def __call__(self, question: str) -> str:
        self.questions.append(question)
        return self.answers.pop(0)


@pytest.fixture
def run(cli: ModuleType, db_session: Session) -> Iterator:  # type: ignore[type-arg]
    def _run(*argv: str, email: str = "admin@example.com", prompt: FakePrompt | None = None) -> int:
        return cli.main(
            list(argv),
            prompt=prompt or FakePrompt(),
            settings=Settings(_env_file=None, admin_email=email),  # type: ignore[call-arg]
            session_factory=lambda: nullcontext(db_session),
        )

    yield _run


def test_creates_the_admin_after_asking_twice(
    run,
    db_session: Session,
    capsys: pytest.CaptureFixture[str],  # type: ignore[no-untyped-def]
) -> None:
    prompt = FakePrompt(STRONG, STRONG)

    assert run(prompt=prompt) == 0

    assert len(prompt.questions) == 2
    admin = find_user(db_session, "admin@example.com")
    assert admin is not None and admin.role is UserRole.ADMIN
    out = capsys.readouterr()
    assert "Created admin account admin@example.com" in out.out
    assert STRONG not in out.out + out.err


def test_second_run_does_not_ask_for_a_password(
    run,
    capsys: pytest.CaptureFixture[str],  # type: ignore[no-untyped-def]
) -> None:
    assert run(prompt=FakePrompt(STRONG, STRONG)) == 0
    prompt = FakePrompt()

    assert run(prompt=prompt) == 0

    assert prompt.questions == []
    assert "already an admin. Nothing was changed." in capsys.readouterr().out


def test_mismatched_confirmation_creates_nothing(
    run,
    db_session: Session,
    capsys: pytest.CaptureFixture[str],  # type: ignore[no-untyped-def]
) -> None:
    assert run(prompt=FakePrompt(STRONG, "Rwenzori-Peaks-2025")) == 1

    assert find_user(db_session, "admin@example.com") is None
    assert "do not match" in capsys.readouterr().err


def test_weak_password_is_refused_before_confirmation(
    run,
    db_session: Session,  # type: ignore[no-untyped-def]
) -> None:
    prompt = FakePrompt("short-pass")

    assert run(prompt=prompt) == 1

    assert len(prompt.questions) == 1
    assert find_user(db_session, "admin@example.com") is None


@pytest.mark.parametrize("email", ["", "   ", "not-an-email", "admin@"])
def test_missing_or_invalid_admin_email_is_refused(
    run,
    email: str,
    capsys: pytest.CaptureFixture[str],  # type: ignore[no-untyped-def]
) -> None:
    prompt = FakePrompt()

    assert run(email=email, prompt=prompt) == 1

    assert prompt.questions == []
    assert "ADMIN_EMAIL" in capsys.readouterr().err


def test_existing_job_seeker_needs_promote_and_is_not_asked_for_a_password(
    run,
    db_session: Session,
    capsys: pytest.CaptureFixture[str],  # type: ignore[no-untyped-def]
) -> None:
    db_session.add(
        User(
            email="admin@example.com",
            email_normalized=normalise_email("admin@example.com"),
            password_hash=hash_password("Their-Own-Pass-123"),
            role=UserRole.JOB_SEEKER,
        )
    )
    # Commit (a savepoint in tests) so the script's rollback after refusing does not undo it.
    db_session.commit()

    prompt = FakePrompt()
    assert run(prompt=prompt) == 1
    assert "--promote" in capsys.readouterr().err

    assert run("--promote", prompt=prompt) == 0
    assert prompt.questions == []
    assert find_user(db_session, "admin@example.com").role is UserRole.ADMIN  # type: ignore[union-attr]
    assert "Promoted admin@example.com" in capsys.readouterr().out


def test_unknown_arguments_are_a_usage_error(run) -> None:  # type: ignore[no-untyped-def]
    with pytest.raises(SystemExit) as exc:
        run("--password", "x")

    assert exc.value.code == 2

"""scripts/seed_reference.py, driven as a function with the test session."""

import importlib.util
import shutil
from contextlib import nullcontext
from pathlib import Path
from types import ModuleType

import pytest
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.services.reference_seed import table_totals

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "seed_reference.py"
REAL_DATA = SCRIPT.parent / "data"


@pytest.fixture(scope="module")
def cli() -> ModuleType:
    spec = importlib.util.spec_from_file_location("seed_reference", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(cli: ModuleType, db: Session, *argv: str) -> int:
    return cli.main(list(argv), session_factory=lambda: nullcontext(db))


def test_seeds_and_prints_a_table_of_counts(
    cli: ModuleType, db_session: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run(cli, db_session) == 0

    out = capsys.readouterr().out
    assert out.splitlines()[0].split() == ["table", "added", "updated", "unchanged", "total"]
    rows = {line.split()[0]: line.split()[1:] for line in out.splitlines()[1:]}
    totals = table_totals(db_session)
    assert set(rows) == set(totals)
    for table, (added, updated, unchanged, total) in rows.items():
        assert (int(added), int(updated), int(unchanged)) == (totals[table], 0, 0)
        assert int(total) == totals[table] > 0


def test_running_again_adds_nothing(
    cli: ModuleType, db_session: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    run(cli, db_session)
    capsys.readouterr()

    assert run(cli, db_session) == 0

    for line in capsys.readouterr().out.splitlines()[1:]:
        table, added, updated, unchanged, total = line.split()
        assert (added, updated) == ("0", "0"), table
        assert unchanged == total, table


def test_bad_data_is_refused_with_a_message(
    cli: ModuleType, db_session: Session, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    data = tmp_path / "data"
    shutil.copytree(REAL_DATA, data)
    (data / "districts.csv").write_text("name,region\nGulu,Narnia\n", encoding="utf-8")

    assert run(cli, db_session, "--data-dir", str(data)) == 1

    err = capsys.readouterr().err
    assert "Refused:" in err and "districts.csv" in err and "Nothing was changed" in err


def test_a_database_that_is_not_ready_is_explained(
    cli: ModuleType, capsys: pytest.CaptureFixture[str]
) -> None:
    class BrokenSession:
        def __enter__(self) -> "BrokenSession":
            return self

        def __exit__(self, *exc: object) -> None:
            return None

        def execute(self, *args: object, **kwargs: object) -> None:
            raise OperationalError("SELECT", {}, Exception("password=hunter2 refused"))

    assert cli.main([], session_factory=lambda: BrokenSession()) == 1

    err = capsys.readouterr().err
    assert "alembic upgrade head" in err
    assert "hunter2" not in err  # the database error text is never printed


def test_unknown_arguments_are_a_usage_error(cli: ModuleType, db_session: Session) -> None:
    with pytest.raises(SystemExit) as exc:
        run(cli, db_session, "--wipe")

    assert exc.value.code == 2

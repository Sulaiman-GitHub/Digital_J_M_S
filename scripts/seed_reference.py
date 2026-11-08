"""Load the reference data (districts, institutions, skills, ...) from scripts/data/*.csv.

Run from the backend folder with its virtual environment active and migrations applied:

    python ..\\scripts\\seed_reference.py

Safe to run as often as you like: it adds new rows, updates changed ones, and never deletes rows
or re-activates one an admin switched off. Uses DATABASE_URL (in .env).
Exit codes: 0 done, 1 the data files are wrong or the database is not ready, 2 usage error.
"""

import argparse
import sys
from collections.abc import Callable, Sequence
from contextlib import AbstractContextManager
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "data"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.exc import SQLAlchemyError  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.services.reference_seed import (  # noqa: E402
    SeedDataError,
    seed_reference,
    table_totals,
)

SessionFactory = Callable[[], AbstractContextManager[Session]]


def _default_session_factory() -> AbstractContextManager[Session]:
    from app.db.session import get_sessionmaker

    return get_sessionmaker()()


def main(
    argv: Sequence[str] | None = None,
    *,
    session_factory: SessionFactory = _default_session_factory,
) -> int:
    parser = argparse.ArgumentParser(description="Seed the reference data from CSV files.")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=DEFAULT_DATA_DIR,
        help="folder with the CSV files (default: scripts/data)",
    )
    args = parser.parse_args(argv)

    try:
        with session_factory() as db:
            counts = seed_reference(db, args.data_dir)
            totals = table_totals(db)
            db.commit()
    except SeedDataError as exc:
        print(f"Refused: {exc}. Nothing was changed.", file=sys.stderr)
        return 1
    except SQLAlchemyError:
        print(
            "Could not seed: the database is not reachable or not migrated "
            "(run `alembic upgrade head`, and check DATABASE_URL in .env).",
            file=sys.stderr,
        )
        return 1

    print(f"{'table':24}{'added':>8}{'updated':>9}{'unchanged':>11}{'total':>8}")
    for name, count in counts.items():
        print(
            f"{name:24}{count.inserted:>8}{count.updated:>9}{count.unchanged:>11}{totals[name]:>8}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())

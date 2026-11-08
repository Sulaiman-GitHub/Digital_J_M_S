"""Create demo employers and vacancies for building the screens.

Run from the backend folder with its virtual environment active, after the migrations and the
reference data (scripts/seed_reference.py):

    python ..\\scripts\\seed_demo.py                 about 200 vacancies from 12 demo companies
    python ..\\scripts\\seed_demo.py --vacancies 5000   a bigger set, for checking query plans
    python ..\\scripts\\seed_demo.py --reset          remove the demo data first, then create it

Development only: it refuses to run unless APP_ENV is "development" (or "test"). Everything it
creates belongs to users with an email ending in @demo.example.test, so --reset removes exactly
that and nothing else. Exit codes: 0 done, 1 refused or not ready, 2 usage error.
"""

import argparse
import sys
from collections.abc import Callable, Sequence
from contextlib import AbstractContextManager
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.exc import SQLAlchemyError  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.services.demo_seed import (  # noqa: E402
    DemoSeedError,
    ensure_allowed,
    reset_demo,
    seed_demo,
)

SessionFactory = Callable[[], AbstractContextManager[Session]]


def _default_session_factory() -> AbstractContextManager[Session]:
    from app.db.session import get_sessionmaker

    return get_sessionmaker()()


def main(
    argv: Sequence[str] | None = None,
    *,
    app_env: str | None = None,
    session_factory: SessionFactory = _default_session_factory,
) -> int:
    parser = argparse.ArgumentParser(description="Create demo employers and vacancies.")
    parser.add_argument("--vacancies", type=int, default=200, help="how many (default 200)")
    parser.add_argument("--employers", type=int, default=12, help="how many (default 12)")
    parser.add_argument("--reset", action="store_true", help="remove existing demo data first")
    parser.add_argument("--seed", type=int, default=42, help="random seed (default 42)")
    args = parser.parse_args(argv)
    if not 1 <= args.vacancies <= 100_000 or not 1 <= args.employers <= 1_000:
        parser.error("--vacancies must be 1 to 100000 and --employers 1 to 1000")

    try:
        ensure_allowed(app_env if app_env is not None else get_settings().app_env)
        with session_factory() as db:
            if args.reset:
                removed = reset_demo(db)
                print(f"Removed {removed} demo employer account(s) and everything under them.")
            result = seed_demo(
                db, employers=args.employers, vacancies=args.vacancies, rng_seed=args.seed
            )
            db.commit()
    except DemoSeedError as problem:
        print(problem, file=sys.stderr)
        return 1
    except SQLAlchemyError as problem:
        print(f"The database is not ready: {problem.__class__.__name__}.", file=sys.stderr)
        return 1

    print(
        f"Created {result.employers} demo companies and {result.vacancies} vacancies: "
        f"{result.live} live, {result.expired} expired, {result.drafts} drafts, "
        f"{result.closed} closed."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

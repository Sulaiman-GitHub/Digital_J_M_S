"""Create the admin account the end-to-end tests log in with. Test database only.

Run by e2e/global-setup.ts from the backend folder with APP_ENV=test. It refuses to do anything
if the environment is not "test", so it can never touch a development or production database.
The email and password come from the environment (set by global-setup), not from this file.
Safe to run again: an existing admin is left as it is.
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.db.session import get_sessionmaker  # noqa: E402
from app.services.admin_setup import create_or_promote_admin  # noqa: E402


def main() -> int:
    if get_settings().app_env != "test":
        print("seed_admin.py only runs with APP_ENV=test.", file=sys.stderr)
        return 1
    email = os.environ.get("E2E_ADMIN_EMAIL", "")
    password = os.environ.get("E2E_ADMIN_PASSWORD", "")
    if not email or not password:
        print("E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are needed.", file=sys.stderr)
        return 1
    with get_sessionmaker()() as db:
        result = create_or_promote_admin(db, email, password)
        db.commit()
    print(f"e2e admin: {result.value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

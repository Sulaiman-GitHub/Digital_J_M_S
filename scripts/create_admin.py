"""Create the first admin, or promote an existing account.

Run from the backend folder with its virtual environment active:

    python ..\\scripts\\create_admin.py            create ADMIN_EMAIL as a new admin
    python ..\\scripts\\create_admin.py --promote  make an existing account an admin

The email comes from ADMIN_EMAIL (in .env). The password is typed at a hidden prompt, twice;
it is never accepted as an argument or read from a file. Safe to run more than once.
Exit codes: 0 success or nothing to do, 1 refused or invalid input, 2 usage error.
"""

import argparse
import getpass
import sys
from collections.abc import Callable, Sequence
from contextlib import AbstractContextManager
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from email_validator import EmailNotValidError, validate_email  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import Settings, get_settings  # noqa: E402
from app.services.admin_setup import (  # noqa: E402
    AdminSetupError,
    AdminSetupResult,
    admin_password_problem,
    create_or_promote_admin,
    find_user,
)

Prompt = Callable[[str], str]
SessionFactory = Callable[[], AbstractContextManager[Session]]

MESSAGES = {
    AdminSetupResult.CREATED: "Created admin account {email} (email marked as verified).",
    AdminSetupResult.PROMOTED: "Promoted {email} to admin. Their existing password still works.",
    AdminSetupResult.ALREADY_ADMIN: "{email} is already an admin. Nothing was changed.",
}


def _default_session_factory() -> AbstractContextManager[Session]:
    from app.db.session import get_sessionmaker

    return get_sessionmaker()()


def _ask_password(prompt: Prompt, email: str) -> str | None:
    """Ask twice. Returns None (after printing why) if the passwords are unusable."""
    password = prompt(f"New admin password for {email}: ")
    if problem := admin_password_problem(password, email):
        print(f"Refused: {problem}", file=sys.stderr)
        return None
    if prompt("Type the password again: ") != password:
        print("Refused: the two passwords do not match. Nothing was changed.", file=sys.stderr)
        return None
    return password


def main(
    argv: Sequence[str] | None = None,
    *,
    prompt: Prompt = getpass.getpass,
    settings: Settings | None = None,
    session_factory: SessionFactory = _default_session_factory,
) -> int:
    parser = argparse.ArgumentParser(description="Create the first admin from ADMIN_EMAIL.")
    parser.add_argument(
        "--promote",
        action="store_true",
        help="make ADMIN_EMAIL an admin even if it already belongs to a job seeker or employer",
    )
    args = parser.parse_args(argv)
    settings = settings or get_settings()

    raw_email = settings.admin_email.strip()
    if not raw_email:
        print("Refused: set ADMIN_EMAIL in .env first.", file=sys.stderr)
        return 1
    try:
        email = validate_email(raw_email, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        print(f"Refused: ADMIN_EMAIL is not a valid email address ({exc}).", file=sys.stderr)
        return 1

    with session_factory() as db:
        password = None
        if find_user(db, email) is None:  # only a brand-new account needs a password
            password = _ask_password(prompt, email)
            if password is None:
                return 1
        try:
            result = create_or_promote_admin(db, email, password, promote=args.promote)
        except AdminSetupError as exc:
            db.rollback()
            print(f"Refused: {exc}", file=sys.stderr)
            return 1
        db.commit()

    print(MESSAGES[result].format(email=email))
    return 0


if __name__ == "__main__":
    sys.exit(main())

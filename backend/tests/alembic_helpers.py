from pathlib import Path

from alembic.config import Config

from tests.db_guard import assert_test_database

BACKEND_DIR = Path(__file__).resolve().parents[1]


def alembic_config(database_url: str) -> Config:
    """Alembic config pointed at the given database. Refuses anything but a *_test database."""
    assert_test_database(database_url)
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    config.attributes["database_url"] = database_url
    # Keep pytest's logging (caplog) intact: do not let env.py apply alembic.ini's logging config.
    config.attributes["skip_logging_config"] = True
    return config

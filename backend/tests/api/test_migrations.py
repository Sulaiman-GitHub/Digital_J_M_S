from alembic import command
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine

from tests.alembic_helpers import alembic_config


def _current_revision(engine: Engine) -> str | None:
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


def test_database_is_at_the_latest_migration(engine: Engine, test_database_url: str) -> None:
    head = ScriptDirectory.from_config(alembic_config(test_database_url)).get_current_head()

    assert head is not None
    assert _current_revision(engine) == head


def test_migrations_downgrade_to_base_and_upgrade_again(
    engine: Engine, test_database_url: str
) -> None:
    config = alembic_config(test_database_url)

    command.downgrade(config, "base")
    assert _current_revision(engine) is None

    command.upgrade(config, "head")
    assert _current_revision(engine) == ScriptDirectory.from_config(config).get_current_head()


def test_models_match_the_migrations(engine: Engine, test_database_url: str) -> None:
    """Fails when a model changes without a migration (same as `alembic check`)."""
    command.check(alembic_config(test_database_url))


def test_there_is_a_single_head(test_database_url: str) -> None:
    heads = ScriptDirectory.from_config(alembic_config(test_database_url)).get_heads()

    assert len(heads) == 1, f"Multiple Alembic heads, merge them: {heads}"

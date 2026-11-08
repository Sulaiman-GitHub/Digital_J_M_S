"""baseline: empty starting point, no tables

Revision ID: 0001_baseline
Revises:
Create Date: 2026-11-04 12:00:00

Gives `alembic current` and `alembic downgrade` a first revision before the identity tables
arrive. Creates nothing.
"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

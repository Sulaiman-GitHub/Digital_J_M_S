"""newest published index

Revision ID: 0009_vacancy_newest_index
Revises: 0008_vacancies
Create Date: 2026-11-06 09:56:27.140350

Review checklist: read every line autogenerate produced, add anything it missed
(CHECK constraints, server defaults, data changes), and make downgrade() reverse upgrade().
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009_vacancy_newest_index"
down_revision: str | Sequence[str] | None = "0008_vacancies"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Reviewed: a partial index so the public list (newest published first) reads only one page.
    op.create_index(
        "ix_vacancies_newest_published",
        "vacancies",
        [sa.literal_column("published_at DESC"), "id"],
        unique=False,
        postgresql_where=sa.text("status = 'published'"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_vacancies_newest_published",
        table_name="vacancies",
        postgresql_where=sa.text("status = 'published'"),
    )

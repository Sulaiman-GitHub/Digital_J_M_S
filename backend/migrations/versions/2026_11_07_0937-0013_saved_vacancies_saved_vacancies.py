"""saved vacancies

Revision ID: 0013_saved_vacancies
Revises: 0012_user_images
Create Date: 2026-11-07 09:37:21.338086

Review checklist: read every line autogenerate produced, add anything it missed
(CHECK constraints, server defaults, data changes), and make downgrade() reverse upgrade().
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013_saved_vacancies"
down_revision: str | Sequence[str] | None = "0012_user_images"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Reviewed: purely additive. One bookmark per user and vacancy (unique constraint); both
    # foreign keys cascade, so deleting the user or the vacancy removes the bookmark.
    op.create_table(
        "saved_vacancies",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("vacancy_id", sa.UUID(), nullable=False),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_saved_vacancies_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["vacancy_id"],
            ["vacancies.id"],
            name=op.f("fk_saved_vacancies_vacancy_id_vacancies"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_saved_vacancies")),
        sa.UniqueConstraint(
            "user_id", "vacancy_id", name=op.f("uq_saved_vacancies_user_id_vacancy_id")
        ),
    )
    op.create_index(
        "ix_saved_vacancies_user_id_created_at",
        "saved_vacancies",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_saved_vacancies_vacancy_id"), "saved_vacancies", ["vacancy_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_saved_vacancies_vacancy_id"), table_name="saved_vacancies")
    op.drop_index("ix_saved_vacancies_user_id_created_at", table_name="saved_vacancies")
    op.drop_table("saved_vacancies")

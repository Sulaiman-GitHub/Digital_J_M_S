"""vacancy reports

Revision ID: 0010_vacancy_reports
Revises: 0009_vacancy_newest_index
Create Date: 2026-11-06 11:45:00.000000

Review checklist: read every line autogenerate produced, add anything it missed
(CHECK constraints, server defaults, data changes), and make downgrade() reverse upgrade().
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_vacancy_reports"
down_revision: str | Sequence[str] | None = "0009_vacancy_newest_index"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Reviewed: reason and status are VARCHAR + named CHECKs (decision 004); autogenerate rendered
    # them as sa.Enum.
    op.create_table(
        "vacancy_reports",
        sa.Column("vacancy_id", sa.UUID(), nullable=False),
        sa.Column("reporter_user_id", sa.UUID(), nullable=True),
        sa.Column("reason", sa.String(length=14), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=9), server_default="open", nullable=False),
        sa.Column("handled_by_user_id", sa.UUID(), nullable=True),
        sa.Column("handled_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint(
            "reason IN ('scam_or_fee', 'fake_employer', 'misleading', 'discriminatory', 'other')",
            name=op.f("ck_vacancy_reports_report_reason"),
        ),
        sa.CheckConstraint(
            "status IN ('open', 'actioned', 'dismissed')",
            name=op.f("ck_vacancy_reports_report_status"),
        ),
        sa.ForeignKeyConstraint(
            ["handled_by_user_id"],
            ["users.id"],
            name=op.f("fk_vacancy_reports_handled_by_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["reporter_user_id"],
            ["users.id"],
            name=op.f("fk_vacancy_reports_reporter_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["vacancy_id"],
            ["vacancies.id"],
            name=op.f("fk_vacancy_reports_vacancy_id_vacancies"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vacancy_reports")),
    )
    op.create_index(
        op.f("ix_vacancy_reports_vacancy_id"), "vacancy_reports", ["vacancy_id"], unique=False
    )
    op.create_index(
        "ix_vacancy_reports_status_created_at",
        "vacancy_reports",
        ["status", "created_at"],
        unique=False,
    )
    # One open report per person per vacancy.
    op.create_index(
        "uq_vacancy_reports_vacancy_reporter_open",
        "vacancy_reports",
        ["vacancy_id", "reporter_user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_vacancy_reports_vacancy_reporter_open",
        table_name="vacancy_reports",
        postgresql_where=sa.text("status = 'open'"),
    )
    op.drop_index("ix_vacancy_reports_status_created_at", table_name="vacancy_reports")
    op.drop_index(op.f("ix_vacancy_reports_vacancy_id"), table_name="vacancy_reports")
    op.drop_table("vacancy_reports")

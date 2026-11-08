"""applications

Revision ID: 0011_applications
Revises: 0010_vacancy_reports
Create Date: 2026-11-06 13:05:07.920841

Review checklist: read every line autogenerate produced, add anything it missed
(CHECK constraints, server defaults, data changes), and make downgrade() reverse upgrade().
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0011_applications"
down_revision: str | Sequence[str] | None = "0010_vacancy_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_STATUSES = (
    "'submitted', 'under_review', 'shortlisted', 'interview', 'offered', 'rejected', 'withdrawn'"
)


def upgrade() -> None:
    # Reviewed: statuses are VARCHAR(12) + named CHECKs (decision 004); autogenerate rendered
    # them as sa.Enum.
    op.create_table(
        "applications",
        sa.Column("vacancy_id", sa.UUID(), nullable=False),
        sa.Column("applicant_user_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=12), server_default="submitted", nullable=False),
        sa.Column("cover_note", sa.Text(), nullable=True),
        sa.Column("cv_storage_key", sa.String(length=32), nullable=False),
        sa.Column("cv_original_filename", sa.String(length=255), nullable=False),
        sa.Column("cv_content_type", sa.String(length=100), nullable=False),
        sa.Column("cv_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("profile_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
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
            f"status IN ({_STATUSES})", name=op.f("ck_applications_application_status")
        ),
        sa.CheckConstraint(
            "char_length(cover_note) <= 2000", name=op.f("ck_applications_cover_note_length")
        ),
        sa.CheckConstraint("cv_size_bytes > 0", name=op.f("ck_applications_cv_size_positive")),
        sa.ForeignKeyConstraint(
            ["applicant_user_id"],
            ["users.id"],
            name=op.f("fk_applications_applicant_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["vacancy_id"],
            ["vacancies.id"],
            name=op.f("fk_applications_vacancy_id_vacancies"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_applications")),
        sa.UniqueConstraint("cv_storage_key", name=op.f("uq_applications_cv_storage_key")),
        sa.UniqueConstraint(
            "vacancy_id",
            "applicant_user_id",
            name=op.f("uq_applications_vacancy_id_applicant_user_id"),
        ),
    )
    op.create_index(
        op.f("ix_applications_applicant_user_id"),
        "applications",
        ["applicant_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_applications_vacancy_id_status", "applications", ["vacancy_id", "status"], unique=False
    )
    op.create_table(
        "application_status_history",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("application_id", sa.UUID(), nullable=False),
        sa.Column("from_status", sa.String(length=12), nullable=True),
        sa.Column("to_status", sa.String(length=12), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            f"from_status IN ({_STATUSES})",
            name=op.f("ck_application_status_history_from_status"),
        ),
        sa.CheckConstraint(
            f"to_status IN ({_STATUSES})", name=op.f("ck_application_status_history_to_status")
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name=op.f("fk_application_status_history_actor_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["application_id"],
            ["applications.id"],
            name=op.f("fk_application_status_history_application_id_applications"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_application_status_history")),
    )
    op.create_index(
        "ix_application_status_history_application_id_created_at",
        "application_status_history",
        ["application_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_application_status_history_application_id_created_at",
        table_name="application_status_history",
    )
    op.drop_table("application_status_history")
    op.drop_index("ix_applications_vacancy_id_status", table_name="applications")
    op.drop_index(op.f("ix_applications_applicant_user_id"), table_name="applications")
    op.drop_table("applications")

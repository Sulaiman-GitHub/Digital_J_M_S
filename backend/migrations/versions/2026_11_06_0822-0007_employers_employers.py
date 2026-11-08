"""employers

Revision ID: 0007_employers
Revises: 0006_consents
Create Date: 2026-11-06 08:22:20.211730

Review checklist: read every line autogenerate produced, add anything it missed
(CHECK constraints, server defaults, data changes), and make downgrade() reverse upgrade().
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_employers"
down_revision: str | Sequence[str] | None = "0006_consents"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STATUSES = "('draft', 'pending', 'approved', 'rejected', 'suspended')"


def upgrade() -> None:
    # Reviewed: the three status columns are VARCHAR + a named CHECK (decision 004); autogenerate
    # rendered them as sa.Enum, whose constraints would not follow the naming convention.
    op.create_table(
        "employers",
        sa.Column("owner_user_id", sa.UUID(), nullable=False),
        sa.Column("company_name", sa.String(length=200), nullable=False),
        sa.Column("registration_number", sa.String(length=50), nullable=True),
        sa.Column("website", sa.String(length=300), nullable=True),
        sa.Column("contact_phone", sa.String(length=13), nullable=True),
        sa.Column("district_id", sa.UUID(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "verification_status",
            sa.String(length=9),
            server_default="draft",
            nullable=False,
        ),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
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
            f"verification_status IN {STATUSES}",
            name=op.f("ck_employers_verification_status"),
        ),
        sa.ForeignKeyConstraint(
            ["district_id"],
            ["districts.id"],
            name=op.f("fk_employers_district_id_districts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["owner_user_id"],
            ["users.id"],
            name=op.f("fk_employers_owner_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employers")),
        sa.UniqueConstraint("owner_user_id", name=op.f("uq_employers_owner_user_id")),
    )
    op.create_table(
        "employer_verification_events",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("employer_id", sa.UUID(), nullable=False),
        sa.Column("from_status", sa.String(length=9), nullable=False),
        sa.Column("to_status", sa.String(length=9), nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("clock_timestamp()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            f"from_status IN {STATUSES}",
            name=op.f("ck_employer_verification_events_from_status"),
        ),
        sa.CheckConstraint(
            f"to_status IN {STATUSES}",
            name=op.f("ck_employer_verification_events_to_status"),
        ),
        sa.CheckConstraint(
            "to_status NOT IN ('rejected', 'suspended') "
            "OR (reason IS NOT NULL AND btrim(reason) <> '')",
            name=op.f("ck_employer_verification_events_reason_required"),
        ),
        sa.ForeignKeyConstraint(
            ["actor_user_id"],
            ["users.id"],
            name=op.f("fk_employer_verification_events_actor_user_id_users"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["employer_id"],
            ["employers.id"],
            name=op.f("fk_employer_verification_events_employer_id_employers"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_employer_verification_events")),
    )
    op.create_index(
        op.f("ix_employer_verification_events_employer_id"),
        "employer_verification_events",
        ["employer_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_employer_verification_events_employer_id"),
        table_name="employer_verification_events",
    )
    op.drop_table("employer_verification_events")
    op.drop_table("employers")

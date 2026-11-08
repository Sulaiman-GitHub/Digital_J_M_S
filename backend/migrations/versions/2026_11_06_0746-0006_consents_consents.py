"""consents

Revision ID: 0006_consents
Revises: 0005_cvs
Create Date: 2026-11-06 07:46:46.239748

Review checklist: read every line autogenerate produced, add anything it missed
(CHECK constraints, server defaults, data changes), and make downgrade() reverse upgrade().
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_consents"
down_revision: str | Sequence[str] | None = "0005_cvs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Reviewed: consent_type is VARCHAR + a named CHECK (decision 004); autogenerate rendered it
    # as sa.Enum, whose constraint would not follow the naming convention.
    op.create_table(
        "consents",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("consent_type", sa.String(length=25), nullable=False),
        sa.Column("policy_version", sa.String(length=50), nullable=False),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "consent_type IN ('terms', 'privacy', 'cv_sharing_with_employers')",
            name=op.f("ck_consents_consent_type"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_consents_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_consents")),
    )
    op.create_index(op.f("ix_consents_user_id"), "consents", ["user_id"], unique=False)
    # One active (not withdrawn) consent per user and type.
    op.create_index(
        "uq_consents_user_id_consent_type_active",
        "consents",
        ["user_id", "consent_type"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_consents_user_id_consent_type_active",
        table_name="consents",
        postgresql_where=sa.text("revoked_at IS NULL"),
    )
    op.drop_index(op.f("ix_consents_user_id"), table_name="consents")
    op.drop_table("consents")

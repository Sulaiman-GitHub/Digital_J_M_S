"""user images

Revision ID: 0012_user_images
Revises: 0011_applications
Create Date: 2026-11-07 08:39:44.521524

Review checklist: read every line autogenerate produced, add anything it missed
(CHECK constraints, server defaults, data changes), and make downgrade() reverse upgrade().
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012_user_images"
down_revision: str | Sequence[str] | None = "0011_applications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Reviewed: `kind` is VARCHAR(5) + a named CHECK (decision 004); autogenerate rendered it as
    # sa.Enum. One active image per user and kind is enforced by the partial unique index.
    op.create_table(
        "user_images",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=5), nullable=False),
        sa.Column("storage_key", sa.String(length=32), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.CheckConstraint("kind IN ('photo', 'logo')", name=op.f("ck_user_images_kind")),
        sa.CheckConstraint("char_length(sha256) = 64", name=op.f("ck_user_images_sha256_length")),
        sa.CheckConstraint("size_bytes > 0", name=op.f("ck_user_images_size_positive")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_images_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_images")),
        sa.UniqueConstraint("storage_key", name=op.f("uq_user_images_storage_key")),
    )
    op.create_index(op.f("ix_user_images_user_id"), "user_images", ["user_id"], unique=False)
    op.create_index(
        "uq_user_images_user_id_kind_active",
        "user_images",
        ["user_id", "kind"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_user_images_user_id_kind_active",
        table_name="user_images",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_index(op.f("ix_user_images_user_id"), table_name="user_images")
    op.drop_table("user_images")

"""vacancies

Revision ID: 0008_vacancies
Revises: 0007_employers
Create Date: 2026-11-06 09:28:00.000000

Review checklist: read every line autogenerate produced, add anything it missed
(CHECK constraints, server defaults, data changes), and make downgrade() reverse upgrade().
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0008_vacancies"
down_revision: str | Sequence[str] | None = "0007_employers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Reviewed: the enum columns are VARCHAR + named CHECKs (decision 004); autogenerate rendered
    # them as sa.Enum. The search vector is a generated column with a GIN index.
    op.create_table(
        "vacancies",
        sa.Column("employer_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("employment_type", sa.String(length=10), nullable=True),
        sa.Column("work_arrangement", sa.String(length=6), nullable=True),
        sa.Column("district_id", sa.UUID(), nullable=True),
        sa.Column("min_qualification_level_id", sa.UUID(), nullable=True),
        sa.Column(
            "min_experience_years", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("salary_min", sa.BigInteger(), nullable=True),
        sa.Column("salary_max", sa.BigInteger(), nullable=True),
        sa.Column("show_salary", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "application_method", sa.String(length=8), server_default="internal", nullable=False
        ),
        sa.Column("external_url", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=9), server_default="draft", nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_by_admin", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('english', coalesce(title, '')), 'A') || "
                "setweight(to_tsvector('english', coalesce(description, '')), 'B')",
                persisted=True,
            ),
            nullable=True,
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
            "employment_type IS NULL OR employment_type IN "
            "('full_time', 'part_time', 'contract', 'internship', 'temporary')",
            name=op.f("ck_vacancies_employment_type"),
        ),
        sa.CheckConstraint(
            "work_arrangement IS NULL OR work_arrangement IN ('onsite', 'remote', 'hybrid')",
            name=op.f("ck_vacancies_work_arrangement"),
        ),
        sa.CheckConstraint(
            "application_method IN ('internal', 'external')",
            name=op.f("ck_vacancies_application_method"),
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'published', 'closed')", name=op.f("ck_vacancies_vacancy_status")
        ),
        sa.CheckConstraint(
            "min_experience_years BETWEEN 0 AND 50", name=op.f("ck_vacancies_experience_range")
        ),
        sa.CheckConstraint(
            "salary_min IS NULL OR salary_min >= 0",
            name=op.f("ck_vacancies_salary_min_not_negative"),
        ),
        sa.CheckConstraint(
            "salary_max IS NULL OR salary_max >= 0",
            name=op.f("ck_vacancies_salary_max_not_negative"),
        ),
        sa.CheckConstraint(
            "salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min",
            name=op.f("ck_vacancies_salary_order"),
        ),
        sa.CheckConstraint(
            "external_url IS NULL OR external_url LIKE 'https://%'",
            name=op.f("ck_vacancies_external_url_https"),
        ),
        sa.CheckConstraint(
            "application_method <> 'internal' OR external_url IS NULL",
            name=op.f("ck_vacancies_internal_no_url"),
        ),
        sa.CheckConstraint(
            "status <> 'published' OR ("
            "description IS NOT NULL AND employment_type IS NOT NULL "
            "AND work_arrangement IS NOT NULL AND expires_at IS NOT NULL "
            "AND published_at IS NOT NULL "
            "AND (work_arrangement = 'remote' OR district_id IS NOT NULL) "
            "AND (application_method <> 'external' OR external_url IS NOT NULL) "
            "AND expires_at <= published_at + interval '90 days')",
            name=op.f("ck_vacancies_published_is_complete"),
        ),
        sa.ForeignKeyConstraint(
            ["district_id"],
            ["districts.id"],
            name=op.f("fk_vacancies_district_id_districts"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["employer_id"],
            ["employers.id"],
            name=op.f("fk_vacancies_employer_id_employers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["min_qualification_level_id"],
            ["qualification_levels.id"],
            name=op.f("fk_vacancies_min_qualification_level_id_qualification_levels"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vacancies")),
    )
    op.create_index(op.f("ix_vacancies_district_id"), "vacancies", ["district_id"], unique=False)
    op.create_index(op.f("ix_vacancies_employer_id"), "vacancies", ["employer_id"], unique=False)
    op.create_index(
        op.f("ix_vacancies_employment_type"), "vacancies", ["employment_type"], unique=False
    )
    op.create_index(
        op.f("ix_vacancies_min_qualification_level_id"),
        "vacancies",
        ["min_qualification_level_id"],
        unique=False,
    )
    op.create_index(
        "ix_vacancies_search_vector",
        "vacancies",
        ["search_vector"],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(
        "ix_vacancies_status_expires_at", "vacancies", ["status", "expires_at"], unique=False
    )

    op.create_table(
        "vacancy_requirements",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("vacancy_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=13), nullable=False),
        sa.Column("skill_id", sa.UUID(), nullable=True),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.Column("is_mandatory", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint(
            "kind IN ('skill', 'qualification', 'certification', 'other')",
            name=op.f("ck_vacancy_requirements_requirement_kind"),
        ),
        sa.CheckConstraint(
            "btrim(label) <> ''", name=op.f("ck_vacancy_requirements_label_not_blank")
        ),
        sa.CheckConstraint(
            "kind <> 'skill' OR skill_id IS NOT NULL",
            name=op.f("ck_vacancy_requirements_skill_has_skill_id"),
        ),
        sa.CheckConstraint(
            "kind = 'skill' OR skill_id IS NULL",
            name=op.f("ck_vacancy_requirements_only_skills_have_skill_id"),
        ),
        sa.ForeignKeyConstraint(
            ["skill_id"],
            ["skills.id"],
            name=op.f("fk_vacancy_requirements_skill_id_skills"),
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["vacancy_id"],
            ["vacancies.id"],
            name=op.f("fk_vacancy_requirements_vacancy_id_vacancies"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_vacancy_requirements")),
    )
    op.create_index(
        op.f("ix_vacancy_requirements_vacancy_id"),
        "vacancy_requirements",
        ["vacancy_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_vacancy_requirements_vacancy_id"), table_name="vacancy_requirements")
    op.drop_table("vacancy_requirements")
    op.drop_index("ix_vacancies_status_expires_at", table_name="vacancies")
    op.drop_index("ix_vacancies_search_vector", table_name="vacancies", postgresql_using="gin")
    op.drop_index(op.f("ix_vacancies_min_qualification_level_id"), table_name="vacancies")
    op.drop_index(op.f("ix_vacancies_employment_type"), table_name="vacancies")
    op.drop_index(op.f("ix_vacancies_employer_id"), table_name="vacancies")
    op.drop_index(op.f("ix_vacancies_district_id"), table_name="vacancies")
    op.drop_table("vacancies")

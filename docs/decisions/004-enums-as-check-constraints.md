# 004: Enums stored as text with a CHECK constraint

- Status: accepted
- Date: 2026-11-04
- Module: 1.1 (database foundation)

## Context

The project requirements say enum values (role, status, purpose, ...) are lowercase strings stored "with a
`CHECK` constraint or a native Postgres enum (pick one in the first database step and stay consistent)".

- Native Postgres enums need `ALTER TYPE ... ADD VALUE` to add a value and cannot drop or rename a
  value without recreating the type, which makes Alembic downgrades awkward. Autogenerate does not
  detect changes to the value list.
- Text plus a `CHECK (col IN (...))` constraint is plain SQL; adding or removing a value is a
  "drop constraint, add constraint" migration that downgrades cleanly.

## Decision

All enum columns are `VARCHAR` with a named `CHECK` constraint, created through the helper
`app.db.base.str_enum(EnumClass, name)`, which uses SQLAlchemy
`Enum(native_enum=False, create_constraint=True, validate_strings=True)` and stores the enum
**values** (lowercase snake_case), not the member names.

- Every enum gets an explicit `name`, so the constraint is called `ck_<table>_<name>` (naming
  convention in `app.db.base`).
- Python enum classes live with their models and use `enum.StrEnum` or `str, Enum` with lowercase
  values.

## Consequences

- The database rejects invalid values even when the API is bypassed.
- Alembic autogenerate does **not** detect a changed value list. A migration that changes an enum
  must drop and recreate the CHECK constraint by hand. Reviewers check this.
- No native enum types to create or drop in migrations.

# 005: PostgreSQL 18 instead of 16

- Status: accepted
- Date: 2026-11-05
- Module: 1.1 (database foundation), recorded before 1.2

## Context

The original plan named PostgreSQL 16. The PostgreSQL installer downloaded on the
developer machine installed **18.6**, while CI ran a `postgres:16` container. Local development
and CI on different major versions can hide version-specific behaviour.

## Decision

Use **PostgreSQL 18** everywhere: local development, CI (`postgres:18` service container in
`.github/workflows/ci.yml`) and, when chosen in Phase 6, production.

## Consequences

- Local and CI run the same major version. All the tests of that step pass on 18 locally and in CI.
- Nothing in the code depends on 16 or 18 specifically; `gen_random_uuid()` is built in since 13.
- The setup instructions and the README now say 18.
- The hosting choice in Phase 6 must offer PostgreSQL 18 (or the version is revisited then).
- Revisit when a new major version is adopted: upgrade local, CI and production together.

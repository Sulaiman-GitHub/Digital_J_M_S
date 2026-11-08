# 008: Consents recorded server-side, terms accepted at registration

- Status: accepted
- Date: 2026-11-06
- Module: 2.5 (CV frontend and consent)

## Context

The requirements ask for terms and privacy consent at registration, and an opt-in to share the CV with
employers, needed before applying. Registration does not log the user in, so the
consent cannot be a separate call after it.

## Decisions

- `POST /auth/register` takes a required `accept_terms: true`. A missing or false value is a 422,
  and nothing is created. On success the same transaction records `terms` and `privacy` consents.
- `POST /consents {consent_type, granted}` gives or withdraws one consent and returns the active
  ones; `GET /consents/me` lists them. Repeating a grant changes nothing.
- Consents are never deleted. Withdrawing sets `revoked_at`. The database allows one active row
  per user and type (partial unique index).
- `terms` and `privacy` cannot be withdrawn through the API (422 `consent_required`); leaving
  means closing the account. `cv_sharing_with_employers` is for job seekers only.
- `POLICY_VERSION` (config) is stored with every consent. Granting again after the version changes
  revokes the old row and adds a new one. Asking users to agree again when it changes is a later
  step; the data to do it is already kept.
- The frontend enforces the checkbox for fast feedback; the server is the authority.
- `/terms` and `/privacy` are static placeholders marked "to be reviewed by a lawyer".

## Consequences

- Module 5 (apply) must check `has_active(user, cv_sharing_with_employers)` on the server.
- `register` changed after the Phase 1 snapshot (`accept_terms`). The Phase 2 snapshot is
  `docs/api-contracts/openapi-phase2.json`.

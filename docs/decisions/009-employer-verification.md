# 009: Employer profile and verification rules

- Status: accepted
- Date: 2026-11-06
- Module: 3.1 (employer profile backend)

## Context

Only a verified employer may publish vacancies. The first step adds the company
profile and the verification state machine; the second adds the admin decisions on top of it.

## Decisions

- **One transition table** in `services/employers.py` maps `(from, to)` to the one role allowed to
  make that change. Everything else is `409 invalid_verification_transition`. The same function
  (`change_status`) is used by employers and, in 3.2, by admins, so there is no second path.
- Allowed: draft to pending, rejected to pending, approved to pending (employer); pending to
  approved or rejected, approved to suspended, suspended to approved (admin).
- **Edit-triggered review.** Changing `company_name` or `registration_number` of an approved profile
  moves it back to pending (a logged transition with a reason), so `can_publish` becomes false until
  an admin approves again. Other fields can be edited freely.
- **Read-only while pending or suspended.** `PUT /employer/me` answers `409 employer_profile_locked`,
  so the details cannot change under the reviewer. A rejected profile can be edited, then submitted.
- **Submission checklist.** Needs a registration number, a description, and a working phone or a
  website (the company name and district are required to save at all). Unverified email is refused
  first (`403 email_not_verified`). A draft can be saved without a verified email.
- **Reasons.** Rejecting or suspending needs a non-empty reason (service check, `422
  reason_required`, and a database CHECK). The employer sees the reason of the current rejection or
  suspension as `status_reason`.
- **History.** `employer_verification_events` is append-only, and every change also writes an audit
  event (`employer_<status>`). Its `created_at` uses `clock_timestamp()` so changes made in one
  transaction still sort correctly.
- **Phone numbers** may be mobile (07..) or landline (03.., 04..), stored as `+256...`. Websites must
  be http or https with a host.
- **No contact-person column yet.** The original table has none; the account email is the contact.
  The admin checklist can show it. Add a column with a new decision if the product owner wants one.

## Admin decisions

- `GET /admin/employers` is paged (`page`, `page_size` up to 50, `meta.total`), filterable with
  `?status=`, and ordered by most recently submitted, with never-submitted drafts last.
- `GET /admin/employers/{id}` returns the profile, the owner's email and its verification state,
  and the history oldest first. `approve`, `reject` and `suspend` call the same `change_status`, lock
  the row first so two admins cannot decide at once, and return the updated detail.
- Approving also reinstates a suspended employer. Suspending blocks new publishing only; vacancies
  already published are not touched.
- The employer is not emailed about a decision yet; they see it as `status_reason` in the app.
  Email notifications are a Phase 6 item with the email provider.

## Consequences

- Vacancy publishing uses the `PublishingEmployer` dependency (`api/deps.py`): `403
  employer_not_verified` unless the employer's company is approved, `403 forbidden` for other roles.
  `POST /employer/vacancies/{id}/publish` uses it, and the Phase 3 gate checks now run against that
  real endpoint (backend `test_employer_vacancies_api.py`, e2e `employer.spec.ts`).
  `test_publishing_gate.py` keeps testing the dependency on its own.
- `UserOut.employer_status` stays null for now; the employer UI reads `GET /employer/me`.

## End-to-end admin

`e2e/global-setup.ts` creates an admin in the `*_test` database (`e2e/seed_admin.py`, which refuses
to run unless `APP_ENV=test`). Its email and password are constants in `e2e/helpers.ts` and are only
ever valid in that throw-away database.

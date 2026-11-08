# 012: Applications

- Status: accepted
- Date: 2026-11-06
- Module: 5.1 (applications backend)

## Context

Job seekers apply to vacancies here, employers review the applicants, and both sides need a
trustworthy record. The requirements fix the data model and the status table.
This records the choices they left open.

## Decisions

- **Applying** needs a job seeker with a verified email, a **live** vacancy that takes applications
  here, a profile, a CV and the CV-sharing consent. Missing pieces come back as `409`
  `profile_required`, `cv_required` or `consent_required`. A vacancy that sends people to another
  website gives `400 external_application` and never creates a row. Draft, closed, expired and
  unknown vacancies are all `404 vacancy_not_found`. Checks run in that order, so a person always
  sees the first thing to fix.
- **One application per person per vacancy**, even after withdrawing (`409 already_applied`),
  enforced by a unique constraint as well as a check.
- **Copies, not links.** Applying copies the CV file under a new random storage key and stores the
  profile as JSON (`profile_snapshot`) with names instead of ids (institution, qualification,
  district, skills, experiences). Editing the profile, replacing or deleting the CV afterwards does
  not change what the employer sees. A failure after the file copy removes the copy again.
- **Who can open an application.** The applicant, and the approved employer who owns the vacancy.
  Everybody else, admins included, gets `404 application_not_found`, as if it did not exist. An
  employer who is no longer approved (for example suspended) gets `403 employer_not_verified` on
  every applicant route, the same rule as publishing.
- **Statuses** follow the agreed table. It is one pure function (`can_move`) used by every route;
  the employer routes and the applicant route share it. Rejected and withdrawn are final. Invalid
  moves are `409 invalid_status_transition`. A closed or expired vacancy does not stop an employer
  working through existing applicants, or an applicant withdrawing.
- **History** is append-only, with `clock_timestamp()` so changes made in one transaction keep
  their order. The API shows who made each change only as `applicant` or `employer`. The employer's
  optional note (at most 1000 characters) is **visible to the applicant**; the screens will say so.
- **The applicant's email** is shown to the vacancy's employer (they need a way to reply) and is
  never in the applicant's own responses. Phone and the rest come from the profile snapshot.
- **CV download** (`GET /employer/applications/{id}/cv`) streams the application's own copy with
  attachment headers and `no-store`, and writes an `application_cv_downloaded` audit event on every
  download. The applicant uses their own `/cv/me/download` and does not use this route.
- **Locked application method.** `application_method` is already locked once a vacancy is
  published, and applications can only exist for published vacancies, so "block changing it once
  applications exist" holds; a test proves it through the update route.
- **Erasure.** Applications cascade when a user row is hard-deleted, but the copied CV files do
  not; account deletion must delete them first, as for the original CV.
- **Not in this module:** a count of applications on the employer's vacancy list (`counts_by_status`
  exists in the service, the route is added with the employer screens), email
  notifications on status changes, and an applicant-side CV download of the
  snapshot.

## Addendum: screens and the Phase 5 gate (Modules 5.2 to 5.4)

- **Applicant screens.** Apply page `/jobs/:id/apply`, list `/applications`, detail
  `/applications/:id` (mockups S7, S8). The vacancy page shows Apply, or "Applied" with the status
  once the person has applied; it asks `GET /applications/me?vacancy_id=` for that (a filter on the
  existing list, not a new endpoint). The consent to share the CV is recorded when the person sends
  the application, if it was not given before.
- **Employer screens.** Applicants `/employer/vacancies/:id/applicants` and one applicant
  `/employer/applications/:id` (mockup S11). The status control offers only
  `next_statuses` from the server, so the screen can never offer a move the table forbids. The
  vacancy list carries `application_count` and `new_application_count` (submitted, not yet looked
  at); a vacancy that sends people to another website shows no count.
- **Gate.** `e2e/journey.spec.ts`: a student applies on a 360 px phone, the employer moves the
  application to under review and shortlisted, the student sees the history, and withdraws; an
  invalid move is refused (409), the applicant cannot set employer statuses (403), and a second
  employer gets 404 for the application, its status, its CV and its applicant list.
  The Phase 5 contract is `docs/api-contracts/openapi-phase5.json`.

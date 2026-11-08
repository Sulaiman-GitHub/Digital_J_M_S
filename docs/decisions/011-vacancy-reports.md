# 011: Vacancy reports

- Status: accepted
- Date: 2026-11-06
- Module: 4.5 (reports)

## Context

Job seekers need a way to flag scams and misleading vacancies, and admins need a safe way to act on
them. The requirements ask for one open report per user per vacancy, rate limiting, and an admin action
that closes the vacancy and can suspend the employer through the existing state machine.

## Decisions

- **Who and what.** Any logged-in user (job seeker, employer or admin) can report a **live**
  vacancy. Draft, closed and expired vacancies cannot be seen, so they cannot be reported (404). An
  employer cannot report their own vacancy (`409 cannot_report_own_vacancy`).
- **One open report per person per vacancy**, enforced by a partial unique index and checked first
  for a clear message (`409 already_reported`). Once a report is handled, the person can report
  again if the problem is still there.
- **"Something else" needs details** (`422`); the other reasons do not. Details are at most 2000
  characters.
- **Rate limit:** `REPORT_RATE_LIMIT` (default `10/hour` per IP). slowapi counts per URL by default,
  and the report URL contains the vacancy id, which would have made the limit apply per vacancy.
  The route uses `shared_limit` with a fixed scope so one counter covers all of a visitor's reports.
- **Admin list** (`GET /admin/reports`): paged, newest first, filter by status. Each item carries
  the vacancy (with a description preview), the company and its verification status, the reporter's
  email (admins only) and how many reports about the vacancy are still open.
- **Resolving** (`POST /admin/reports/{id}/resolve`) is once only (`409 report_already_resolved`):
  - `dismiss`: the report is dismissed; the vacancy and other reports are untouched.
  - `action`: the vacancy is closed (it leaves public search at once) and **every open report about
    that vacancy** becomes `actioned`, since the vacancy is gone. A vacancy that was already closed
    is simply left closed.
  - `suspend_employer: true` (only with `action`) suspends the company through
    `employers.change_status`, so the same rules apply: it needs a reason (the `note`, which the
    employer sees) and an approved company. Anything that fails rolls back the whole resolution, so
    a refused suspension never leaves the vacancy closed.
- **Audit:** `vacancy_reported` (with the reason), and `report_dismissed` or `report_actioned` with
  the vacancy id, whether it was closed, whether the employer was suspended, and the note.
- **The reporter is never shown to the employer.** Only admins see who reported.

## Consequences

- A report is a soft signal; nothing happens to a vacancy until an admin acts.
- The frontend cannot know whether the person already reported a vacancy before this session, so
  the report button is always offered and a repeat is answered with "You reported this vacancy".
  Adding "my reports" to the API would remove that round trip if it matters later.
- Notifying the employer when their vacancy is closed by a report is a Phase 6 item with the email
  provider.

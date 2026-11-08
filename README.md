# Digital Job Matching System

Job platform for students and graduates of all tertiary institutions in Uganda.

See `docs/decisions/` for the architecture and design decisions and `docs/design/` for the screen designs.

**Want to run it and try it yourself? Read `docs/HOW_TO_RUN.md`.**

## Requirements

Git, Python 3.12, Node.js LTS, PostgreSQL 18.

## First-time setup (Windows CMD)

1. Copy `.env.example` to `.env` in the repo root and fill in real local values.
   `.env` is gitignored. Never commit it.
   `TEST_DATABASE_URL` must point at a database whose name ends in `_test`
   (for example `djm_test`); the backend test suite refuses to run otherwise.
2. Backend:

   ```text
   cd backend
   py -3.12 -m venv .venv
   .venv\Scripts\activate
   py -m pip install -r requirements-dev.txt
   ```

3. Frontend:

   ```text
   cd frontend
   npm ci
   npx playwright install chromium
   ```

## Daily commands

```text
:: backend (from backend\, venv active)
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
pytest -q
ruff check .
alembic upgrade head

:: frontend (from frontend\)
npm run dev
npm run lint
npm run test
npm run build
npx playwright test
```

- API docs: http://localhost:8000/docs
- App: http://localhost:5173 (the dev server proxies `/api` to the backend)
- End-to-end tests start the backend and the frontend themselves (see below).

## End-to-end tests

From `frontend\`: `npx playwright test`. It starts both servers for you:

- The backend runs in `APP_ENV=test`: it uses `TEST_DATABASE_URL` (a `*_test` database, never
  `djm_dev`), keeps emails in memory, and exposes a test-only inbox endpoint
  (`/api/v1/_test/emails`) that does not exist in any other environment. Real mail is never sent.
- The auth rate limit is raised for the run (`AUTH_RATE_LIMIT`), because one browser makes many
  register and login requests from one address.
- Apply migrations to the test database first: `alembic upgrade head` with the test database
  configured (pytest does this itself).
- Do not run Playwright and `pytest` at the same time: both use the `*_test` database, and the
  migration tests recreate its tables.
- Stop any backend already running on port 8000; the run refuses to reuse it.
- Each test registers its own `e2e.*@example.com` user, so runs never collide. These users stay in
  the test database, but pytest rebuilds that database at the start of every run, so they never
  affect it.

## Reference data (districts, institutions, skills, ...)

The dropdown lists come from CSV files in `scripts/data/`. Load them into the database:

```text
:: from backend\, venv active, after: alembic upgrade head
python ..\scripts\seed_reference.py
```

- Safe to run again at any time: it adds new rows, updates changed ones, and never deletes rows or
  switches back on a row an admin deactivated. It prints how many rows were added or updated.
- A bad CSV stops the script before anything is saved, with a message naming the file and line.
- **The starter lists are unreviewed.** See `scripts/data/README.md` and check them before the pilot.
- Public endpoints: `GET /api/v1/reference/districts`, `qualification-levels`, `institutions`,
  `fields-of-study` and `skills?q=` (see `/docs`).

## CV uploads

A job seeker has one active CV (PDF, DOC or DOCX, at most `MAX_CV_BYTES`, default 5 MB).

- Endpoints (job seekers only, see `/docs`): `GET`, `POST` and `DELETE /api/v1/cv/me`, and
  `GET /api/v1/cv/me/download`. Uploading again replaces the current CV.
- Files are saved under random names in `STORAGE_LOCAL_DIR` (default `backend/storage`, ignored by
  git). Back this folder up together with the database.
- `UPLOAD_RATE_LIMIT` (default `10/minute`) limits uploads per IP.
- There is no virus scanning. See `docs/decisions/007-cv-storage.md` for the design and limits.
- Consents: registration needs `accept_terms`, and `POST /api/v1/consents` records the opt-in to
  share a CV with employers. `POLICY_VERSION` is stored with each consent
  (`docs/decisions/008-consents.md`). In the app, the CV and the opt-in are the last profile step.

## Employer profile and verification

Employers keep a company profile (`GET`/`PUT /api/v1/employer/me`) and send it for verification
(`POST /api/v1/employer/me/submit`, verified email needed). Only an `approved` employer can
publish. The rules and the status table are in `docs/decisions/009-employer-verification.md`.
Admins list, view and decide with `GET /api/v1/admin/employers`, `GET .../{id}` and
`POST .../{id}/approve | reject | suspend` (reject and suspend need a reason).

In the app: employers use **My company** (`/employer`, `/employer/profile`). A status banner shows
above every employer page, and every publishing button should use `PublishButton`
(`frontend/src/features/employers/PublishButton.tsx`), which stays disabled with the reason written
next to it until the company is approved. Admins use **Employers** (`/admin/employers`): a queue
with status filters, then a detail page with the checklist, history and the Approve, Reject and
Suspend actions. Mockups: `docs/design/mockups/s9-employer-banner.html` and `s12-admin-verification.html`.

## Vacancies

Employers manage vacancies with `GET`/`POST /api/v1/employer/vacancies`,
`GET`/`PUT /api/v1/employer/vacancies/{id}` and `POST .../{id}/publish | close`. Publishing needs an
approved company; a published vacancy keeps its title, type, place and how to apply; closed is
final. Admins can create a vacancy for a partner employer with `POST /api/v1/admin/vacancies`.
A vacancy is "live" when it is published and has not expired (computed, never stored). The rules
are in `docs/decisions/010-vacancies.md`.

Anyone can browse: `GET /api/v1/vacancies` (search with `q`, filter, page; see `/docs`) and
`GET /api/v1/vacancies/{id}`. Only live vacancies appear.

Employers manage vacancies under **My company** (`/employer`): a list with status filters, a form
(`/employer/vacancies/new`, `/employer/vacancies/:id`) with sections for the basics, pay,
requirements (skills and typed ones, each Required or Preferred), how to apply and a closing date
(a date picker limited to 89 days ahead, so the server's 90-day rule always holds), Save draft,
Publish (disabled with the reason until the company is approved) and Close with a confirmation.
Admins create a vacancy for a partner employer at `/admin/vacancies/new`. Mockups:
`docs/design/mockups/s9-employer-banner.html` and `s10-vacancy-form.html`.

In the app: the home page (`/`) has the search box and the latest vacancies, `/jobs` is the list
(search words, filters and the page are all in the address, so links can be shared and the back
button works), and `/jobs/:id` is one vacancy. For a vacancy that takes applications on another
website, the page says so and opens that site in a new tab.

### Reports

Logged-in users can report a live vacancy from its page (`POST /api/v1/vacancies/{id}/reports`, one
open report per person per vacancy, `REPORT_RATE_LIMIT`). Admins handle reports under **Reports**
(`/admin/reports`): dismiss, or close the vacancy (which removes it from public search) and
optionally suspend the employer. Rules: `docs/decisions/011-vacancy-reports.md`. Mockup:
`docs/design/mockups/s13-admin-reports.html`.

### Demo data (development only)

```text
:: from backend\, venv active, after: alembic upgrade head and the reference data
python ..\scripts\seed_demo.py                :: 12 demo companies and about 200 vacancies
python ..\scripts\seed_demo.py --reset        :: remove the demo data first, then create it
python ..\scripts\seed_demo.py --vacancies 5000   :: a bigger set, for checking query plans
```

It refuses to run unless `APP_ENV` is `development` (or `test`), and it only creates and removes
rows that belong to demo users (`@demo.example.test`).

## First admin account

Registration can only create job seekers and employers. Create the first admin with a script:

1. Set `ADMIN_EMAIL` in `.env`.
2. From `backend\`, with the virtual environment active and migrations applied:

   ```text
   python ..\scripts\create_admin.py
   ```

   Type the password at the hidden prompt, twice. Admin passwords need at least 12 characters.
   The password is never accepted as an argument or from a file.

- Running it again is safe: an existing admin is left unchanged.
- If the email already belongs to a job seeker or employer, the script refuses. Add `--promote`
  to make that account an admin; it keeps its password and no prompt appears.
- Suspended or deleted accounts are refused; resolve those by hand.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:
ruff and pytest against a PostgreSQL 18 test database, then ESLint, Vitest and the
production build for the frontend.

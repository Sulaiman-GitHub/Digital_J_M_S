# How to run and try the system

This page explains how to run the Digital Job Matching System on your own Windows computer and
testing it yourself. It is the MVP: everything runs locally, emails are printed in the terminal, and
there is no payment or subscription feature yet. Commands are for **Windows CMD**.

## 1. What you need installed

- Git, Python 3.12, Node.js (LTS), PostgreSQL 18.
- A modern browser. To check the phone layout, press F12 in Chrome and choose the phone icon, then
  pick a width of 360.

## 2. One-time setup

1. **Settings file.** In the project folder, copy `.env.example` to `.env`. Edit it:
   - `DATABASE_URL` and `TEST_DATABASE_URL`: your PostgreSQL user and password. The test database
     name must end in `_test` (for example `djm_test`); the development one is for you (`djm_dev`).
   - `SECRET_KEY`: any long random text (it is fine to leave `change-me` while testing locally).
   - `ADMIN_EMAIL`: the email address you want for your admin account.
   - Leave `EMAIL_BACKEND=console`. No email service is needed: verification and reset links are
     printed in the backend terminal.
2. **Create the two databases** (once), for example in pgAdmin or `psql`: `djm_dev` and `djm_test`,
   owned by the user in your `.env`.
3. **Backend packages:**

   ```text
   cd backend
   py -3.12 -m venv .venv
   .venv\Scripts\activate
   py -m pip install -r requirements-dev.txt
   alembic upgrade head
   python ..\scripts\seed_reference.py
   python ..\scripts\create_admin.py
   ```

   `alembic upgrade head` builds the tables. `seed_reference.py` loads districts, institutions,
   fields of study, skills and qualification levels. `create_admin.py` asks for the admin password
   twice (it is not shown). It must be at least 12 characters and not a common password.
4. **Frontend packages:**

   ```text
   cd frontend
   npm ci
   ```

5. **Optional demo jobs** (about 200 fictional vacancies so the job list is not empty):

   ```text
   cd backend
   .venv\Scripts\activate
   python ..\scripts\seed_demo.py
   ```

## 3. Start the system (every time)

Open **two** CMD windows.

Window 1, the backend (leave it open, it also shows the emails):

```text
cd backend
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Window 2, the website:

```text
cd frontend
npm run dev
```

Open **http://localhost:5173**. The interactive API documentation is at http://localhost:8000/docs.
To stop, press Ctrl+C in each window.

## 4. Try it yourself: a complete walk-through

Use three browser windows, or one normal window plus two private windows, so you can be three
people at the same time. After each registration, look in **Window 1**: the "email" with the
confirmation link is printed there. Copy the link into the browser.

**A. The admin.** Log in with `ADMIN_EMAIL` and the password you set. You will see **Employers**,
**Reports** and the admin vacancy form.

**B. The employer.**
1. Register as **Employer**, confirm the email, log in.
2. Open **My company**, fill in the company profile, and send it for verification.
3. As the admin: **Employers** > open the company > check the list > **Approve**.
4. As the employer: **New vacancy**, fill it in, **Publish**. (Publish stays greyed out, with the
   reason beside it, until the company is approved.)

**C. The student.**
1. Register as **Job seeker**, confirm the email, log in.
2. **Profile**: fill in the steps, upload a CV (PDF or Word, up to 5 MB) and tick the box that lets
   employers you apply to see your profile and CV.
3. **Find jobs**: search, use the filters, open the vacancy, press **Apply**, write an optional
   note, **Send application**.
4. **Applications** shows it as Submitted.

**D. Back to the employer.** **My company** now shows "1 applicant, 1 new". Open it, open the
applicant, read the profile, **Download CV**, move the status to **Under review**, then
**Shortlisted** with a note. The student sees the new status, the history and the note under
**Applications**, and can **Withdraw**.

**E. Reports.** As any logged-in user, open a vacancy and press **Report this vacancy**. The admin
sees it under **Reports** and can dismiss it or close the vacancy (and suspend the company).

**F. Your data.** On **My account** you can **Download my data** (a JSON file) and **Delete
account** (asks for your password; irreversible).

## 5. Running the automatic checks

```text
:: backend (backend\, venv active)
ruff check .
pytest -q

:: frontend (frontend\)
npm run lint
npm run test
npm run build
npx playwright test
```

- `pytest` and `playwright` both use the `*_test` database: **do not run them at the same time**.
- `npx playwright test` starts both servers itself. Stop your own backend first (port 8000).
- GitHub runs all of these on every push.

## 6. Common problems

| Problem | What to do |
| --- | --- |
| "TEST_DATABASE_URL ... must end with _test" | Fix the name in `.env`. This protects your real data. |
| Page is blank or "could not reach the server" | Is Window 1 (backend) running? The site proxies `/api` to port 8000. |
| No confirmation email | It is not sent anywhere: look for it in Window 1. |
| Can not log in after 5 wrong tries | Wait 15 minutes, or use "Forgot password" (link also printed in Window 1). |
| "Too many requests" | The rate limits are working. Wait a minute (an hour for reports and applications). |
| Dropdowns are empty | Run `python ..\scripts\seed_reference.py` again. |
| Start again from nothing | Drop and recreate `djm_dev` in pgAdmin, then repeat step 2.3. (Ask before doing this to a database you care about.) |

## 7. Where your files live

- Database: PostgreSQL `djm_dev`.
- Uploaded CVs: `backend\storage` (random file names, never served directly). Back this folder up
  together with the database.
- Settings: `.env` (never commit it or share it).

## 8. What the MVP does not include yet

- **Real email delivery.** Emails are printed in the terminal (provider and sending domain are a
  later step).
- **Hosting.** The system runs only on your computer. Putting it online (server, domain, HTTPS,
  backups) is the last task, once you have finished testing.
- **Legal text.** The Terms of Use and Privacy Policy are placeholders to be reviewed by a lawyer.
- **Payments, subscriptions, saved jobs, matching scores, notifications, messaging** (later
  releases).
- What the code was checked against is in `docs/SECURITY_AUDIT.md`.

## 9. Where to read more

- `docs/decisions/`: why things were built the way they are.
- `docs/design/mockups/`: the screen designs (open the `.html` files in a browser).
- `README.md`: shorter day-to-day commands.

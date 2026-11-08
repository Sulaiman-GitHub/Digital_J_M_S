# 006: Phase 1 authentication choices

- Status: accepted
- Date: 2026-11-05
- Modules: 1.3 to 1.7 (email, auth backend, admin script, auth frontend, auth E2E)

## Context

The project requirements set the shape of authentication but leave some
behaviour open. These are the choices made while building Phase 1, so they are not lost.

## Decisions

**Accounts and sign-in**
1. **Duplicate email on registration returns 409 `email_taken`.** It reveals that an account
   exists, which the requirements only forbid for login and password reset. Chosen because it is far clearer
   for users. The frontend shows it under the email field.
2. **No automatic login after registering.** The user sees "Check your email", then logs in.
3. **Login errors:** unknown email and wrong password give byte-identical 401 responses and take
   similar time (a dummy hash is verified for unknown emails). A suspended account gets 403
   `account_suspended` only after a correct password; deleted accounts get the generic 401.
4. **Lockout:** 5 failed logins for the same normalised email within 15 minutes give 429
   `too_many_attempts`, even with the right password. Counted from `audit_events` (`login_failed`),
   so no extra table. A successful login resets the count. Works the same for unknown emails.
5. **Passwords:** 8 to 128 characters, a built-in list of common passwords is refused, and so is the
   email address itself. Admin passwords need 12 or more characters (create_admin script).
6. **Resetting a password also marks the email as verified** (the link proved the inbox is read by
   the owner) and revokes every session of that user. Suspended and deleted accounts get no reset
   email. A newer verification or reset link retires the older unused one.

**Sessions and CSRF**
7. Cookies: `djm_session` (HttpOnly) and `djm_csrf` (readable), `SameSite=Lax`, `Secure` in
   production. The CSRF header must equal the cookie and match the hash stored on that session.
   Register, login, verify-email, forgot-password and reset-password need no CSRF token: they have no
   session yet, accept JSON only, and cookies are `SameSite=Lax`.
8. A suspended or deleted user loses access on the next request (sessions are checked against the
   user's status); sessions are revoked on logout and on password reset.

**Rate limits**
9. `AUTH_RATE_LIMIT` (default `5/minute` per IP) applies to register, login, forgot-password and
   resend-verification. It is a validated setting read on every request, so tests can change it.
   Counts are in memory (one server process); use Redis if the app ever runs on several servers.
   Behind a reverse proxy the real client IP must come from the forwarded header (Phase 6).

**Email**
10. Production requires `EMAIL_BACKEND=smtp` (the console sender logs links that act like
    passwords). Emails are sent as background tasks after the database commit, through
    `send_email_safely`, which never raises and never logs the body.

**Test environment**
11. `APP_ENV=test` always uses `TEST_DATABASE_URL` and refuses anything not named `*_test`, so a test
    run can never touch `djm_dev`. It always uses a shared in-memory email outbox (never real mail).
12. The test-only inbox `GET` and `DELETE /api/v1/_test/emails` exists only when `APP_ENV=test`. It is
    not registered elsewhere, is not in the OpenAPI schema, and re-checks the environment itself.
13. Playwright starts the backend (in test mode) and the frontend. It refuses to reuse a backend
    already on port 8000. Playwright and pytest must not run at the same time: both use `djm_test`.

## Consequences

- Known gaps, scheduled: security response headers, request size limits and an endpoint-by-endpoint
  review are part of the hardening step; the real client IP behind a proxy and an SMTP provider are Phase 6.
- `GET /api/v1/health` has no response model in OpenAPI (a plain dictionary); the frontend type
  matches what it returns.
- Phase 1 OpenAPI snapshot: `docs/api-contracts/openapi-phase1.json`.

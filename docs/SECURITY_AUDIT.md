# Security audit

Reviewed against the project's permission rules and security baseline. Date: 2026-11-06.
CSRF applies to every unsafe method on a logged-in route (header must match the cookie and the
session). "Ownership" means the server looks the record up through the caller's own id; anyone else
gets 404 (or 403 for a role mismatch).

## Endpoints

| Endpoint | Auth and role | Ownership | Rate limit | Proven by |
| --- | --- | --- | --- | --- |
| `GET /health` | public | none | none | test_health |
| `GET /reference/*` (5) | public (read-only lists) | none | none | test_reference_api |
| `GET /vacancies`, `GET /vacancies/{id}` | public; live vacancies only | live predicate | none | test_public_vacancies_api |
| `POST /auth/register` | public | none | `AUTH_RATE_LIMIT` per IP | test_auth_register, test_auth_rate_limit |
| `POST /auth/login` | public | none | `AUTH_RATE_LIMIT` | test_auth_login, test_auth_rate_limit |
| `POST /auth/forgot-password` | public | none; same answer for unknown emails | `AUTH_RATE_LIMIT` | test_auth_reset |
| `POST /auth/reset-password` | public, one-time token | token | `AUTH_RATE_LIMIT` (added in 6.1) | test_auth_reset, test_hardening |
| `POST /auth/verify-email` | public, one-time token | token | `AUTH_RATE_LIMIT` (added in 6.1) | test_auth_verify, test_hardening |
| `POST /auth/resend-verification` | user + CSRF | self | `AUTH_RATE_LIMIT` | test_auth_verify |
| `POST /auth/logout`, `GET /auth/me` | user (+ CSRF) | own session | none | test_auth_session |
| `GET/POST /consents` | user (+ CSRF) | self; CV consent job seekers only | none | test_consents_api |
| `GET/PUT /profile/me` | job seeker (+ CSRF) | own profile, no id in URL | none | test_profile_api |
| `GET/POST/DELETE /cv/me`, `GET /cv/me/download` | job seeker (+ CSRF) | own CV, no id in URL | uploads: `UPLOAD_RATE_LIMIT`; body: 5 MB | test_cv_api |
| `GET/PUT /employer/me`, `POST /employer/me/submit` | employer (+ CSRF); submit needs verified email | own company | none | test_employer_api |
| `GET/POST/PUT /employer/vacancies`, `.../{id}`, `/close` | employer (+ CSRF) | vacancy of own company, else 404 | none | test_employer_vacancies_api |
| `POST /employer/vacancies/{id}/publish` | employer, **approved** company (+ CSRF) | own vacancy | none | test_publishing_gate |
| `POST /vacancies/{id}/reports` | user (+ CSRF) | cannot report own vacancy | `REPORT_RATE_LIMIT` shared | test_reports_api |
| `POST /vacancies/{id}/applications` | job seeker, verified email (+ CSRF) | own profile, CV and consent | `APPLY_RATE_LIMIT` shared (added in 6.1) | test_applications_api, test_hardening |
| `GET /applications/me` | job seeker | own applications | none | test_applications_api |
| `GET /applications/{id}` | applicant, or approved employer owning the vacancy | 404 for anyone else, admins included | none | test_applications_api |
| `POST /applications/{id}/withdraw` | job seeker (+ CSRF) | owner only | none | test_applications_api |
| `GET /employer/vacancies/{id}/applications` | approved employer | own vacancy, else 404 | none | test_applications_api |
| `POST /employer/applications/{id}/status` | employer, approved (+ CSRF) | owner of the vacancy; transition table | none | test_applications_api |
| `GET /employer/applications/{id}/cv` | approved employer | owner of the vacancy; audit event per download | none | test_applications_api |
| `GET /admin/employers*`, `POST .../approve/reject/suspend` | admin (+ CSRF) | none (admin) | none | test_admin_employers_api |
| `POST /admin/vacancies` | admin (+ CSRF) | partner employer must exist | none | test_admin_vacancies_api |
| `GET /admin/reports`, `POST .../resolve` | admin (+ CSRF) | none (admin) | none | test_admin_reports_api |
| `/_test/*` | exists only when `APP_ENV=test` | n/a | n/a | test_expire_vacancy_support, test_auth_* |

## Baseline checks

| Item | State |
| --- | --- |
| Passwords hashed (Argon2), common passwords refused | done in Phase 1 |
| Sessions: random token, hash stored, HttpOnly cookie, expiry, revocation on password reset | done in Phase 1 |
| CSRF on every unsafe method of logged-in routes | done; `require_csrf` on each route above |
| Secrets only from environment; production refuses default `SECRET_KEY`, empty `DATABASE_URL`, console email | done in Phase 0 (`core/config.py`), tests in test_config |
| Security headers on every response (`nosniff`, frame deny, referrer, permissions, CSP for the API, HSTS in production) | **added in 6.1** (`core/http_safety.py`) |
| Request body limit: 1 MB for ordinary requests, 5 MB for the CV upload, counted even without a length | **added in 6.1** |
| Interactive docs and `openapi.json` off in production | **added in 6.1** |
| Structured errors with a request id on every response; unhandled errors logged with the id | done in Phase 0 |
| File uploads: type by content, random storage key, attachment headers, never served from a public folder | done in Phase 2 |
| Audit events for logins, admin decisions, vacancy changes, reports, applications, CV downloads | done |

## Gaps found and what was done

1. **No security headers.** Added `SecurityHeadersMiddleware`. The reverse proxy
   repeats them for the static frontend, which this API does not serve.
2. **No limit on ordinary bodies.** Added `BodySizeLimitMiddleware` (1 MB).
3. **`/docs` public in production.** Switched off when `APP_ENV=production`.
4. **No limit on applying** (each application copies a CV file). Added `APPLY_RATE_LIMIT`
   (default 30 per hour per address).
5. **No limit on `verify-email` and `reset-password`.** Tokens are long and random, so guessing is
   hopeless, but the endpoints are cheap to hammer. Now under `AUTH_RATE_LIMIT`.

## Known limits, left for the owner

- Rate limits are per process and per address as the server sees it; behind a proxy the real client
  address must be configured.
- No virus scanning of CVs.
- No 2FA, device list or lockout after repeated failed logins beyond the per-address limit
  (planned for a later release).

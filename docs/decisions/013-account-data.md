# 013: Account export and deletion

- Status: accepted
- Date: 2026-11-06
- Module: 6.2

## Decisions

- **Export** (`GET /account/export`, any logged-in user): the caller's own account, consents and, by
  role, the profile, CV details (not the file; its download link is given), applications with the
  profile and cover note they sent and their history, or the company and its vacancies. An audit
  event `account_exported` is written. Never another person's data.
- **Delete** (`DELETE /account`, password required again, CSRF, rate limited): admins cannot delete
  themselves here (403). An employer with a live vacancy is refused (`409 live_vacancies`) and must
  close them first.
- **What is removed:** the profile (skills, experiences with it), CV rows and every CV file
  including the copies held by applications, cover notes, the profile snapshot of each application
  (replaced with "Deleted user"), email tokens. Sessions are revoked.
- **What stays:** the user row, kept as a husk (status `deleted`, email replaced by a placeholder
  that cannot be mailed, no password), so audit events, reports and the application history keep
  pointing at something. Applications and their status history stay for the employer, who sees
  "Deleted user" and no email; the CV download answers 404 `applicant_deleted`. Consent records stay
  (they hold no personal data beyond the user id). A company keeps its vacancies, which are closed,
  but loses its contact details and name ("Deleted company").
- **The address is freed**: the same email can register again as a new account.
- **Retention rule for deleted accounts and old applications** is a legal question and is left to the owner; this module deletes at once.
- **Screens:** "Your data" on the account page: download (a JSON file made in the browser) and a
  delete dialog with a clear warning and a password field.

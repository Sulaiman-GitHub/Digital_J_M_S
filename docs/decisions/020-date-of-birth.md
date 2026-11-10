# 020: Date of birth on the job seeker profile

- Status: accepted
- Date: 2026-11-10

## Decision

- `seeker_profiles.date_of_birth` (nullable date, migration 0014). Optional.
- Allowed range: at least 16 and at most 80 years old. Checked in the browser and on the server.
- Private. It is not part of the application snapshot, so employers never see it, and it is not
  used for search, matching or sorting (age-based filtering would risk discrimination).
- The job seeker sees it in "Your data" (the existing data download) and it is deleted with the
  profile when the account is deleted.

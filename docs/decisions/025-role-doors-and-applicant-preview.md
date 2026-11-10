# 025: Role doors on the login page, role homes, applicant preview

- Status: accepted
- Date: 2026-11-10

## Decision

- The login page shows three doors: Job seeker, Employer, Admin (also `?as=employer`). It is one
  form and one endpoint; the server alone decides the real role. The door only changes the wording,
  and the Admin door says admin accounts are created by the system owner (no register link).
- After login each role lands on its own home: job seeker `/account`, employer `/employer`,
  admin `/admin/employers` (unless a safe `?next=` address was given).
- Employers get a "Quick view" pop-up on the applicant list: photo, qualification, skills, summary
  and cover note, loaded only when opened, with a link to the full application where status
  changes and the CV live.

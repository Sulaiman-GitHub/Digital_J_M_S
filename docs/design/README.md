# Design

Design source for the Digital Job Matching System. Screens are built to
these files; each screen's task should name its mockup path.

- `tokens.md`: colours, tints, status colours, type, spacing, measured contrast.
- `mockups/`: static HTML mockups. Open the files directly in a browser (no server needed).
  Each page shows the phone layout (360 px) and desktop layout (1280 px), plus notes on states.
  `mockup.css` is shared by the mockups only; it is not used by the app.

| # | Screen | File | Status |
| --- | --- | --- | --- |
| S1 | Home | `mockups/s1-home.html` | Approved; built with the public job screens |
| S2 | Job list | `mockups/s2-job-list.html` | Approved; built with the public job screens |
| S3 | Vacancy card | `mockups/s3-vacancy-card.html` | Approved; built with the public job screens |
| S4 | Vacancy detail | `mockups/s4-vacancy-detail.html` | Approved; built with the public job screens |
| S5 | Register, login, verify, reset, header | `mockups/s5-auth.html` | Approved |
| S6 | Profile stepper | `mockups/s6-profile.html` | Built with the profile screens; not yet reviewed by the product owner |
| S9 | Employer area, banner and vacancy list | `mockups/s9-employer-banner.html` | Banner built with the employer screens, vacancy list with the vacancy screens; not yet reviewed by the product owner |
| S10 | Vacancy form | `mockups/s10-vacancy-form.html` | Built with the vacancy screens; not yet reviewed by the product owner |
| S12 | Admin employer verification | `mockups/s12-admin-verification.html` | Built with the admin screens; not yet reviewed by the product owner |
| S13 | Reports | `mockups/s13-admin-reports.html` | Built with the reports screens; not yet reviewed by the product owner |
| S7, S8, S11 | | | To do, as their phase approaches |

All names, companies and figures in the mockups are fictional samples.
Brand name, colours and logo are placeholders until decided.

Mockup details that the API cannot support yet were left out of the public job screens rather than faked: the
"positions" fact, field of study, the "Posted" filter, a "Closing soon" sort, and the "Verified
employer" badge. The Report link is shown disabled until reports existed, and Apply is disabled until
Phase 5.

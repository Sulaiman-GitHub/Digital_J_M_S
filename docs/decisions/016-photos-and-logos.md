# 016: Profile photos and company logos

- Status: accepted
- Date: 2026-11-07
- Module: 6.6

## Context

The owner asked for profile photos and company logos, as on the job sites used as a reference. A
photo is personal data and an employer could see a candidate's face, so visibility is decided here.

## Decisions

- **Who has what.** Job seekers have an optional *photo*; employers have an optional *logo*. One
  active image per user and kind (partial unique index on `user_images`, like CVs). A job seeker
  cannot upload a logo and an employer cannot upload a photo (403).
- **Visibility.**
  - A photo is seen by its owner, and by the employer of a vacancy the person applied to
    (`GET /employer/applications/{id}/photo`, 404 for any other company, for a deleted applicant,
    and when there is no photo). It is the *current* photo, not a copy made at apply time. It is
    not shown to anyone else, in any list or on any public page.
  - A logo is public, but only through a live vacancy of an approved company
    (`GET /vacancies/{vacancy_id}/logo`). The company id is never in an address (the public
    vacancy data never exposes it). Vacancy cards and details carry `company_logo_url` /
    `employer.logo_url`, or null.
  - No consent record is added: the existing agreement to share the profile and CV with employers
    you apply to, and the wording on the apply screen and the privacy page, now say "photo" too.
    The recorded consent text itself is unchanged.
- **Formats and checks.** JPEG, PNG and WebP only, at most 2 MB (`MAX_IMAGE_BYTES`). The file's own
  first bytes decide the type; the file name and the client's content type are ignored. SVG is
  refused (it can carry scripts). Same pattern as CVs: random storage key, size limit enforced
  before the body is buffered, rate limit, CSRF, no id in the own-picture URLs, no storage path
  ever returned.
- **Serving.** Pictures are streamed with the server-decided `Content-Type`,
  `X-Content-Type-Options: nosniff`, and the API's `default-src 'none'` policy. Own and applicant
  photos use `Cache-Control: private, no-cache`; public logos `public, max-age=300`.
- **Account export and deletion.** The export lists the photo or logo (type, size, date, link).
  Deleting an account removes the picture row and file, like the CV.
- **Front end.** An uploader on the profile (CV step) and the company profile page; the picture
  shows in the account button, on vacancy cards and pages (logo), and on the employer's applicant
  list and page (photo). Where there is no picture, or it fails to load, the initials badge from
  decision 015 is shown.

## Known limits (accepted for the pilot)

- Images are stored as uploaded. They are **not re-encoded or resized**, and EXIF data (such as
  camera or GPS) is **not removed**. Doing that needs an image library (Pillow); it is the first
  thing to add if photos become widespread.
- The content check looks at the file signature only; a file that starts like a PNG but is
  corrupt is stored and simply will not display (the initials show instead).
- No moderation of picture content. A company can be suspended by an admin, which hides its logo.

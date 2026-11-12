# 026: Landing page redesign, photos, support section

- Status: accepted
- Date: 2026-11-12

## Context

The owner asked for a landing page that looks like a normal jobs website (full-width, with photos,
no large empty space at the bottom) and that tells people what DJMS is for. It should also carry
simple adverts and a request for donors so the service can meet its costs, without distracting
people who are searching or applying. References: Indeed for Employers, UGJobNet and a commercial
"HiringHub" template. Only the layout ideas are used; no code, text or images are copied from them.

## Decisions

- **Layout.** The home page (`/`) runs in full-width bands; content is capped at `max-w-6xl`
  (1152 px). On `/` only, `AppLayout` drops the `max-w-5xl` wrapper and the header and footer use the
  same wider cap. Every other page keeps `max-w-5xl`. Colours stay on the existing blue tokens
  (decisions 014, 019, 021); the template's green is not used.
- **Sections, in order.** Photo hero with the search and the real open-jobs count; Our vision (two
  photos); Latest vacancies with a quick-links side column; How it works (numbered steps with a
  link each); Why use DJMS; For employers (photo); Support DJMS; Questions and answers; footer.
- **Support and adverts.** One clearly labelled "Support DJMS" panel after the vacancies, with two
  cards marked "Sponsored" (Advertise with us, Partner with DJMS). It appears only on the landing
  page. There are no adverts on the job list, job details, apply pages or any signed-in page, and
  no sticky bars or pop-ups. There is no payment on the site (payments are a later release, see
  OPEN_QUESTIONS): people phone or email, and the owner arranges the rest. No sponsors or donors are
  invented; the cards invite organisations to get in touch.
- **Contact details** (given by the owner, 2026-11-12): phone +256 740 994 073 and email
  djm@gmail.com, shown in the hero, the support panel and the footer. They live in
  `features/home/landingContent.ts`.
- **No invented numbers** (decision 022 still applies): the only figure is the real count of open
  jobs, hidden when there are none. Other highlights are words (Free, Verified, Every).
- **Photos.** Free-to-use photos from Pexels (the Pexels licence allows free commercial use without
  attribution; the source is recorded here anyway). Stored in `frontend/public/images/landing/`,
  JPEG at web sizes. Photos of people on the landing page are illustrative stock, not users of DJMS.

  | File | Pexels photo | Used for |
  | --- | --- | --- |
  | `hero-1400.jpg`, `hero-800.jpg` | 30575961 | hero (graduates throwing caps) |
  | `graduates.jpg` | 36098139 | vision (three graduates) |
  | `interview.jpg` | 18287137 | vision (job interview) |
  | `handshake.jpg` | 5439469 | employers band |

  Page for each: `https://www.pexels.com/photo/<id>/`. Meaningful photos have alt text; the hero
  image is decorative (`alt=""`). Only the hero loads eagerly.

## Known limits

- The hero photo is about 330 KB at 1400 px (125 KB at 800 px); the browser picks by screen width.
  Converting to WebP is a later optimisation.
- Sponsor cards are static text. If the owner finds sponsors, their cards are added in code (no
  advert server, no tracking scripts).
- The "Sponsored" cards invite contact only; the owner must reply to the phone and email above.

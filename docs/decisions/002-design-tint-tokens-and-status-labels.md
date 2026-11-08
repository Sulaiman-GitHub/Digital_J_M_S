# 002: Tint colour tokens, restricted palette, "Not selected" label

- Status: accepted
- Date: 2026-11-04
- Module: 0.5 (design system and mockups)

## Context

The original design tokens define strong colours only. Status badges (8.5) and notices need light backgrounds, and
every text pair must meet 4.5:1 contrast (5.7). Measured contrast (WCAG 2):

- Strong colour text on a 12% tint fails for success (4.27) and warning (4.25).
- Amber accent `#F59E0B` on white is 2.15:1, so it cannot be used as text.
- Border `#E5E7EB` on white is 1.24:1, too faint for input edges (3:1 non-text rule).

## Decision

1. Add six tint tokens at about 6% strength (amber at 10%), each paired with its strong colour as
   text and a 1 px border in that colour:
   `primary-tint #F1F7F6`, `success-tint #F1F7F3`, `warning-tint #FAF5F0`, `danger-tint #FBF1F1`,
   `info-tint #F1F4FD`, `accent-tint #FEF5E7`. All pairs measure 4.62:1 or higher.
2. Amber is a highlight colour only. "Closing soon" text uses the warning colour (5.02:1).
3. Input borders use the secondary text colour; the border token is for decorative dividers.
4. Tailwind's default colour palette is switched off (`--color-*: initial` in `src/index.css`), so
   only design tokens can be used in components.
5. The applicant-facing label for the `rejected` status is **"Not selected"**. The API and database
   value stays `rejected`.

Full table with measured ratios: `docs/design/tokens.md`.

## Consequences

- Components cannot use arbitrary Tailwind colours (`gray-500` etc.); new colours need a token.
- Brand colours are still placeholders. If they change, re-measure contrast and update
  `tokens.md` and `src/index.css` together.
- Employer and admin screens may choose their own wording for `rejected` when they are designed.

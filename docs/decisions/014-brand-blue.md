# 014: Brand colours, blue and white

- Status: accepted
- Date: 2026-11-07
- Module: 6.4

## Decision

The owner wants the look of LinkedIn and Indeed: blue and white. The original teal was a
placeholder, so it is replaced.

- Primary `#0A66C2`, hover `#004182`, primary tint `#EAF2FB`. White on primary is 5.69:1, primary on
  white 5.69:1, primary on its tint 5.04:1 (all above the 4.5:1 rule).
- Page background is the light grey surface `#F3F6F8` with white cards (a soft shadow, a stronger one
  on hover). Borders are `#DCE3EA`.
- The home page opens with a blue search banner; the header has a blue "DJ" logo mark.
- "Shortlisted" stays teal (new `--color-teal` / `--color-teal-tint`, the old primary values) so it
  is not confused with the blue "Under review".
- Only tokens and a few layout classes changed; no component logic changed. A real logo and final
  brand name are still open.

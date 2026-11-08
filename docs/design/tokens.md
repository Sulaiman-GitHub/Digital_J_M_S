# Design tokens

Source: the project's design plan (placeholders until the brand is chosen).
These are implemented once in `frontend/src/index.css` (Tailwind `@theme`). Components use
tokens only; Tailwind's default colour palette is switched off.

## Colour

| Token | CSS variable | Value | Use |
| --- | --- | --- | --- |
| Primary | `--color-primary` | `#0A66C2` | Primary buttons, links, focus ring, active states |
| Primary hover | `--color-primary-hover` | `#004182` | Hover/pressed for primary |
| Accent | `--color-accent` | `#F59E0B` | **Highlights only** (backgrounds, dots, bars). Never text on white |
| Text | `--color-text` | `#111827` | Body text, headings |
| Text secondary | `--color-text-secondary` | `#4B5563` | Meta text, help text |
| Background | `--color-bg` | `#FFFFFF` | Page |
| Surface | `--color-surface` | `#F3F4F6` | Page sections, skeletons, inputs on hover |
| Border | `--color-border` | `#E5E7EB` | Card and divider borders (decorative only) |
| Success | `--color-success` | `#15803D` | |
| Warning | `--color-warning` | `#B45309` | Also "closing soon" text |
| Danger | `--color-danger` | `#B91C1C` | Errors, destructive buttons |
| Info | `--color-info` | `#1D4ED8` | |

### Tints (added; needed for badges and banners)

Very light backgrounds for status badges and notices, always with text in the matching
strong colour and a 1 px border in that colour.

| Token | Value | Pair with | Contrast |
| --- | --- | --- | --- |
| `--color-primary-tint` | `#EAF2FB` | primary text | 5.04:1 |
| `--color-teal-tint` | `#F1F7F6` | teal text (`--color-teal` `#0F766E`) | 5.05:1 |
| `--color-success-tint` | `#F1F7F3` | success text | 4.62:1 |
| `--color-warning-tint` | `#FAF5F0` | warning text | 4.64:1 |
| `--color-danger-tint` | `#FBF1F1` | danger text | 5.84:1 |
| `--color-info-tint` | `#F1F4FD` | info text | 6.09:1 |
| `--color-accent-tint` | `#FEF5E7` | warning text | 4.65:1 |

### Measured contrast (WCAG 2, target 4.5:1 for text)

| Pair | Ratio | OK for text |
| --- | --- | --- |
| Text on white | 17.74 | yes |
| Secondary on white / on surface | 7.56 / 6.87 | yes |
| White on primary / on primary hover | 5.47 / 7.58 | yes |
| Primary on white | 5.47 | yes |
| Success / Warning / Danger / Info on white | 5.02 / 5.02 / 6.47 / 6.70 | yes |
| White on danger | 6.47 | yes |
| Text on accent | 8.26 | yes |
| **Accent on white** | **2.15** | **no** (highlight only) |
| Border on white | 1.24 | no (decorative; inputs use the secondary colour for their border) |

Input borders use `--color-text-secondary` so the field edge meets the 3:1 non-text contrast rule.

## Application status colours (8.5)

Always shown with the text label, never colour alone.

| Status | Label | Style |
| --- | --- | --- |
| `submitted` | Submitted | secondary text on surface |
| `under_review` | Under review | info on info tint |
| `shortlisted` | Shortlisted | teal on teal tint |
| `interview` | Interview | warning on accent tint |
| `offered` | Offered | success on success tint |
| `rejected` | Not selected | danger on danger tint |
| `withdrawn` | Withdrawn | secondary text, outline only (white background) |

`rejected` is labelled "Not selected" for applicants; the API value stays `rejected`.

## Shape, space, type

| Token | Value |
| --- | --- |
| Radius | `--radius-card: 8px` (cards, inputs, buttons), `--radius-pill: 999px` |
| Spacing | Tailwind default scale (4 px grid): use 1, 2, 3, 4, 6, 8, 12 = 4, 8, 12, 16, 24, 32, 48 px |
| Font | System stack: `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (no webfont download) |
| Body | 16 px / 1.5. Inputs never below 16 px (prevents zoom on phones) |
| Headings | 20 / 24 / 32 px, weight 600, line height 1.25 |
| Small text | 14 px for meta only (never on inputs or buttons) |
| Tap target | 44 × 44 px minimum |
| Breakpoints | `sm 640`, `md 768`, `lg 1024`, `xl 1280` (Tailwind defaults) |
| Focus | 2 px outline in primary, 2 px offset, on `:focus-visible` |

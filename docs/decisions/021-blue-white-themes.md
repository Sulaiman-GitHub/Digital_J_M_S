# 021: Blue and white themes, with a dark mode

- Status: accepted
- Date: 2026-11-10
- Supersedes the brand colour part of decision 019 (indigo). Decision 014's blue is back, stronger.

## Decision

- The Information Systems Officer asked for a blue and white look with a light/dark toggle.
  Brand blue is `#1d4ed8` (hover `#1e40af`, deep `#1e3a8a`) on white and pale blue surfaces.
- Dark mode redefines the same tokens under `:root[data-theme='dark']` in `src/index.css`:
  navy page, slightly lighter navy cards, light-blue brand colour, brighter status colours.
- New tokens: `card` (panels, replaces `bg-white`), `on-solid` (text on a solid colour: white in
  light mode, dark navy in dark mode), `hero-from` / `hero-to` (the banner is deep blue in both).
- The theme is chosen in this order: the saved choice (`localStorage` key `djm-theme`), then the
  device setting. An inline script in `index.html` sets it before first paint to avoid a flash.
  If storage is blocked the toggle still works for the current visit.

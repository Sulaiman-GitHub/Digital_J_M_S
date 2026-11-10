# 019: Indigo theme, simpler navigation, profile sections

- Status: accepted
- Date: 2026-11-10

## Why

Feedback from the Information Systems Officer: the colours were plain, the navigation vague, the
"Any" radio buttons noisy, and the profile felt like one long page.

## Decision

- The brand colour moves from blue (`#0a66c2`, decision 014) to indigo (`#4338ca`, hover
  `#3730a3`, deep `#2e1f8f`). Surfaces, borders and text greys get a slightly cooler tint, the
  info colour becomes sky blue so it differs from the brand, and cards are rounder (12 px).
  Only the tokens in `src/index.css` hold colours; docs/design/tokens.md is updated to match.
  The PWA colours (manifest, theme-color, offline page) follow. The PNG app icons are still blue
  placeholders (decision 018) and are replaced when a real logo exists.
- Header: "My account" leaves the main bar (it is in the account menu), so each role shows only
  its working links. Employers also get "Company profile" in the account menu.
- Filters: the "Any" radio is gone. Choices are chips, with a "Clear" link once one is chosen.
- Profile: each section has its own address (`/profile/basics`, `/profile/education`, ...). It is
  still one form and one save, so nothing about the API changes. Moving between sections never
  triggers the unsaved-changes warning; leaving `/profile` does.

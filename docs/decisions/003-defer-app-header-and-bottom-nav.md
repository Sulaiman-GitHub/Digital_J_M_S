# 003: Defer AppHeader (mobile menu) and BottomNav

- Status: accepted
- Date: 2026-11-04
- Module: 0.5 (design system and mockups)

## Context

The design plan lists `AppHeader` with a mobile menu and `BottomNav` for job seekers among the shared
components to build first. The first task list does not include them, and in
Phase 0 there are no signed-in screens, roles or destinations for them to link to.

## Decision

Do not build `AppHeader` or `BottomNav` in the first step. Keep the simple header in
`frontend/src/components/AppLayout.tsx` until real navigation exists:

- `AppHeader` (signed-in and anonymous states, mobile menu): with the authentication frontend.
- `BottomNav` (job seekers on phones): with the profile frontend, when there are seeker
  destinations (Jobs, Applications, Profile).

The S1 to S4 mockups show the anonymous header only; the signed-in header and bottom nav are designed
with those modules.

## Consequences

- No placeholder navigation to maintain or rewrite.
- Modules 1.6 and 2.3 must include these components, their tests and mockups in their plans.

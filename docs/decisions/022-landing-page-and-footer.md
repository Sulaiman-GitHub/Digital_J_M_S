# 022: Landing page and site footer

- Status: accepted
- Date: 2026-11-10

## Decision

From the Information Systems Officer's list (more informative home page, detailed footer, animation).

- The home page keeps the search hero and latest vacancies and adds: a trust line, floating shapes
  in the hero, "How it works", "Why use DJMS", an employer band, and a Q&A. Sections fade in as they
  scroll into view (`Reveal`, IntersectionObserver; shown at once where it is missing). All motion
  is switched off for people who ask their device for reduced motion.
- No invented numbers: the only figure shown is the real count of open jobs. Claims on the page
  describe what the system does today (administrator-approved employers, CV consent, data
  download and deletion, no cost to students).
- A footer on every page: brand, links by audience (they change with the signed-in role),
  help/legal links and a back-to-top link. Contact details are not shown until there is a real
  support address (decision needed, see docs/OPEN_QUESTIONS.md).
- Links like `/#faq` scroll to their section.

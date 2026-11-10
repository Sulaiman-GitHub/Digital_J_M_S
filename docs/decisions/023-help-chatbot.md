# 023: Help chatbot without machine learning

- Status: accepted
- Date: 2026-11-10

## Decision

- A floating help button on every page opens a small chat. It answers basic questions about
  registering, profiles, CVs, applying, statuses, employers, privacy and themes.
- It is a fixed script: `features/chatbot/knowledge.ts` holds topics (keywords plus an answer and
  links) and `answer.ts` scores a question against them by whole-word keyword matches. No model,
  no network call, no data leaves the browser, and it can only say what we wrote.
- Answers adapt to the signed-in role (links to profile, dashboard or registration).
- Unknown questions get a polite fallback with starter questions. Support contact details are
  never invented; it says so until a real address exists (docs/OPEN_QUESTIONS.md).
- A test checks every link the bot can give points to a real page.
- On phones the button sits above the sticky bottom bars so it never covers Save or Apply.

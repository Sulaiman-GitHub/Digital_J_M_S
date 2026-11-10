# 024: Notification bell and links to other job sites

- Status: accepted
- Date: 2026-11-10

## Decision

- Job seekers get a bell in the header with an unread badge. It is worked out in the browser from
  data the API already returns: an employer's decision on an application (any status after
  "Submitted") and unfinished set-up (unverified email, no profile). No new endpoint, table or
  email. "Mark all as read" stores a timestamp in `localStorage` per user, so read state belongs to
  that device only. To-do items stay until the thing is done.
- Employers and admins have no bell yet. Their screens already show counts and banners, and a
  real feed (new applicants, review results) needs server-side events: a later decision.
- "Other job sites": each job and the job list show plain search links (LinkedIn, Indeed, Google
  Jobs) for the same words, in a new tab with `noopener`. We do not copy or embed their listings,
  and say we are not responsible for those sites. Only sites whose search address is known are
  listed; add more in `features/vacancies/jobSites.ts`.
- The job list already has a side pane on wide screens, so no second "quick view" popup was added.

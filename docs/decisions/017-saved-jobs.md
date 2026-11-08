# 017: Saved jobs

- Status: accepted
- Date: 2026-11-07
- Module: 6.7

## Decisions

- **Who.** Only job seekers can save jobs. Employers and admins get 403; visitors get 401 and see no
  bookmark. A saved job is private: only its owner can read, add or remove it, and nobody else's id
  is ever accepted (everything is found through the logged-in user).
- **Table.** `saved_vacancies` (user, vacancy, saved time), one row per user and vacancy (unique
  constraint). Both foreign keys cascade. Purely additive migration.
- **API** (`/saved-vacancies`, job seekers only):
  - `PUT /{vacancy_id}` saves (204; safe to repeat; CSRF; only an open vacancy, otherwise 404).
  - `DELETE /{vacancy_id}` removes (204; safe to repeat; CSRF).
  - `GET /` lists the open saved vacancies as the same cards the public list uses, most recently
    saved first, paged (page size up to 50).
  - `GET /ids` lists just the ids of the open saved vacancies, so every card can show a filled
    bookmark with one request.
- **Cap.** At most 200 saved jobs per person (409 `saved_limit` after that), so a script cannot fill
  the table. Saving something already saved never fails because of the cap.
- **Closed or expired jobs** stay saved (the row is kept) but are not listed and not in `ids`; they
  simply drop off the list. They come back if the vacancy is ever open again.
- **Order** uses the real clock (`clock_timestamp()`), not the transaction time, so jobs saved in
  quick succession keep their order.
- **Account.** The export includes the saved jobs (vacancy id and time); deleting the account
  removes them.
- **Front end.** A bookmark on every card (outside the card's link, so a card is never a link
  inside a link) and a "Save job" button on the vacancy page, both only for job seekers; the change
  shows at once and goes back with a message if the server refuses. A "Saved jobs" page at `/saved`
  with loading, empty, error and paging states; a link in the header and a Saved tab in the phone
  bottom navigation.

## Not done

Saved-job reminders or emails, folders or notes on saved jobs, and sharing a list.

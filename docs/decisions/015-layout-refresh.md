# 015: Layout refresh (job-site patterns)

- Status: accepted
- Date: 2026-11-07
- Module: 6.5

## Decisions

The owner asked for the layout of established job sites (Indeed was the example). We copy the
patterns, not their logo, text, images or code.

- **Search bar:** one rounded bar with "what" and "where" and a blue Search button, on the home
  page (inside the blue banner) and at the top of the job list. On phones the two fields stack. The
  "where" field is the district filter. Labels stay for screen readers.
- **Filter chips:** on desktop the left filter column is replaced by a row of chips (Job type,
  Where you work, Qualification). Each opens a short list; a chip shows its choice. Phones keep the
  "Filters" sheet (unchanged).
- **Two panes:** at 1024 px and wider, the job list shows the chosen job's details beside it (the
  first job by default). A plain click selects; a new-tab or modified click still opens the page.
  Below 1024 px a card opens the full job page as before. The address stays `/jobs?...`; the
  selected job is not in the address.
- **Company badge:** a round badge with the company's initials in a colour taken from the design
  tokens, on cards and the job page. No uploads yet (company logos are covered in decision 016).
- **Login and register** sit in a white card.
- No API or data model change.

## Not done here

Profile photo and company logo uploads (6.6) and saved jobs (6.7) need backend work and their own
decisions.

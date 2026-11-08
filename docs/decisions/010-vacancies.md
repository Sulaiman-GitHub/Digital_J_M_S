# 010: Vacancy rules

- Status: accepted
- Date: 2026-11-06
- Module: 4.1 (vacancy backend)

## Context

The requirements describe vacancies; full-text search and computed expiry
apply. The first step adds the data model and the employer and admin write side. Search and the
public API come next.

## Decisions

- **Drafts can be incomplete; published vacancies cannot.** Only the title is needed to save. The
  service checks completeness when publishing (and when editing a published vacancy), reporting
  every missing field together (`422 vacancy_incomplete`). A database CHECK
  (`published_is_complete`) enforces the same for published rows, including the 90-day limit.
- **Expired is never stored.** Live means `status = 'published' AND expires_at > now()`.
  `services/vacancies.live_clause()` and `is_live()` are the one definition; the public API (4.2)
  must use them. `is_live` is returned on every vacancy so screens do not recompute it.
- **Publishing needs an approved company.** The publish route uses the `PublishingEmployer`
  dependency (`403 employer_not_verified`). Saving drafts, editing and closing do not need
  approval, so a suspended employer can still tidy up or close their own vacancies.
- **A published vacancy keeps its identity.** Title, employment type, work arrangement, district,
  application method and external link cannot change (`422 field_locked`, listing the fields).
  Description, requirements, minimum level and experience, salary and the expiry can. The expiry must
  stay in the future and within 90 days of the original publish time, so an expired vacancy can be
  extended again within that window. Once applications exist (Phase 5) the application method stays
  locked, which it already is.
- **Closed is final.** Edit, publish and close on a closed vacancy are `409 vacancy_closed`. A draft
  can be closed to discard it.
- **Ownership.** An employer reaches only their own vacancies; others get `404 vacancy_not_found`
  (never 403, so ids do not leak). The service lets an admin reach any vacancy, but the only admin
  route is the one the API list names.
- **Requirements** are replaced as a whole on every save (max 20). Skill requirements take their
  label from the skill; other kinds need a label; each carries `is_mandatory`, which release 2
  matching depends on. The same skill cannot be listed twice.
- **Admin on behalf of a partner.** `POST /admin/vacancies` needs an approved employer
  (`409 employer_not_verified`), sets `created_by_admin`, and creates a draft. I added an optional
  `publish: true` so a partner job can go live in one step (the supply plan needs admins to publish
  them; the original API list had no admin publish route). The same checks apply and nothing is saved if
  publishing fails.
- **One endpoint beyond the original API table:** `GET /employer/vacancies/{id}`, so the edit form
  can load one vacancy by id. It is owner-only like the rest.
- **Salary** is integer UGX, at most 10 billion, and `salary_max >= salary_min`. Dates must
  carry a time zone.
- **Employer list** is paged (up to 50), filterable by status, most recently changed first.

## Consequences

- 4.2 builds the public list and detail on `live_clause()` and the generated `search_vector`.
- Phase 5 adds the "application method cannot change once applications exist" check to a vacancy
  that has applications (it is already locked once published).
- Deleting an employer cascades to its vacancies; Phase 5 must decide what happens to applications.

## Public search and detail

- `GET /vacancies` and `GET /vacancies/{id}` need no login and use `live_clause()` only. A draft,
  closed or expired vacancy is `404 vacancy_not_found` on the detail route, even for its owner.
- **Cards** hold title, company, district, type, arrangement, dates and the salary only if the
  employer chose to show it. **Detail** adds the description, requirements, the minimum level's name,
  experience, how to apply (the external link for external vacancies) and the company's name and
  district. It never carries contact data, the registration number, the employer id, `status` or
  `created_by_admin`.
- **Search** is `websearch_to_tsquery('english', q)` on the generated `search_vector`, ranked with
  `ts_rank` (title matches outrank description matches). Quotes, `-word` and `or` work; odd text
  (quotes, operators, SQL) never causes an error; a query of only stop words matches nothing.
- **Sorting:** `sort=relevance` is the default with `q`, `newest` otherwise. `relevance` without a
  search means newest. Ties break on id so pages never repeat or skip a row.
- **Filters:** `district_id`, `employment_type`, `work_arrangement`, and `qualification_level_id`
  (vacancies that ask for nothing, or for a level at or below it). Unknown district or level ids are
  `422`. Paging: `page`, `page_size` (1 to 50, default 20), `meta.total`.
- A vacancy of a company that was suspended later stays live until it expires or is closed
  (suspending only blocks new publishing).

### Query plans on 5,000 vacancies (4,013 live), after `ANALYZE`

| Query | Plan | Time |
| --- | --- | --- |
| Newest first, no filters (page of 20) | Index scan on the new partial index `ix_vacancies_newest_published`, stops after 20 rows. Before the index: sequential scan of all rows, 8.4 ms | 0.19 ms |
| Filters: district, type, level | Bitmap AND of `ix_vacancies_district_id` and `ix_vacancies_employment_type` | 0.25 ms |
| District only | Bitmap scan on `ix_vacancies_district_id` | 0.29 ms |
| Rarer words ("veterinary animals") | Bitmap scan on the GIN index `ix_vacancies_search_vector` | 0.85 ms |
| Very common word ("accountant", 5% of rows) | Sequential scan; correct for a table this small. With sequential scans disabled the GIN index is used too | 2.3 ms |
| Count of live vacancies | Bitmap scan on `ix_vacancies_status_expires_at` | 1.3 ms |

The partial index was added in migration 0009. `scripts/seed_demo.py --vacancies 5000` recreates
this data. Check plans again when real volumes are known; the total count is the part that grows
with the table.

## End-to-end

`e2e/vacancies.spec.ts` covers the Phase 4 gate: a verified employer publishes through the screens
and a visitor finds the vacancy by keyword and filters at 360 px; an expired vacancy is absent from
search and detail; an unapproved employer's publish call is refused; and a reported vacancy that an
admin acts on leaves search. The expired case uses the test-only route
`POST /_test/vacancies/{id}/expire` (APP_ENV=test only), because the real API never accepts a past
closing date. Shared setup helpers are in `e2e/api-helpers.ts`. The API snapshot for the end of
Phase 4 is `docs/api-contracts/openapi-phase4.json`.

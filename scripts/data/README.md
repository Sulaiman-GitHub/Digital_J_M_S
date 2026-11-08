# Reference data (seed lists)

Loaded by `scripts/seed_reference.py`. One CSV per table, UTF-8, header row first.

> **TO BE REVIEWED BY THE PRODUCT OWNER.** These are starter lists compiled by an AI assistant,
> not an official source. They shape every dropdown in the app, so check them before the pilot:
> districts, institutions and skills especially.

| File | Columns | Notes |
| --- | --- | --- |
| `districts.csv` | `name`, `region` | Region is Central, Eastern, Northern or Western. Uganda created new districts in 2020 and later, so recent ones may be missing. Cities are not listed separately: Kampala is included; other cities fall under their district. |
| `qualification_levels.csv` | `name`, `rank` | Ranks 1 to 6, ordered. "Ongoing" is handled by `study_status` on the profile, not here. |
| `institutions.csv` | `name`, `institution_type`, `district` | Type is `university`, `college`, `technical_institute`, `vocational` or `other`. `district` is optional and must be a name from `districts.csv`. "Other" institutions are typed by the user, not listed. |
| `fields_of_study.csv` | `name` | |
| `skills.csv` | `name` | Matching ignores case and extra spaces, so "Microsoft Excel" and "microsoft  excel" are the same skill. |

Rules for editing:

- Names must be unique (skills: unique ignoring case). Duplicates make the seed script stop.
- Re-running the seed adds new rows and updates changed region, type, district and rank. It never
  deletes rows and never switches a row an admin deactivated back on.
- Renaming a row in a CSV adds a new row; the old one stays until an admin deactivates it.

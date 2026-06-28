# Branch: `add-csv-import-template` — progress log

Branched from `main`.

## Progress Update as of 2026-05-27 Pacific
*(Most recent updates at top)*

### Summary
Commit the downloadable CSV import template as a static asset:
`public/Founder Festival CSV Template - Sheet1.csv`.

It's a small template (header notes + `Full Name, Company, LinkedIn`
columns, all optional) used as the example/download for bulk import &
matching. It had been sitting untracked in the working tree across
several earlier commits; per the user it should be committed and
shipped to prod.

### Files
- `public/Founder Festival CSV Template - Sheet1.csv` (new static
  asset; served at `/Founder%20Festival%20CSV%20Template%20-%20Sheet1.csv`).

### Also done this session (not in this branch)
- Applied the events Luma-columns migration to prod + merged the Luma
  sync feature (PR #83).
- Purged the 190 stray non-Luma test events from the dev DB (other
  agents' test suites had recreated them); the 5 Luma events remain.

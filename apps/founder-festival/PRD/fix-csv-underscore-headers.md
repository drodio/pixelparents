# Branch: `fix-csv-underscore-headers` — progress log

## Progress Update as of 2026-06-01 (hotfix)
*(Most recent updates at top)*

### Summary of changes since last update
Hotfix for the bulk-scoring CSV import (shipped in PR #150). A real upload with
`first_name,last_name,email` headers (underscores) failed with "no valid lines in
input": the header matcher only recognized space/no-separator tokens
("first name"/"firstname"), so `first_name`/`last_name` didn't map → rows parsed
with an email but NO name → `csvRowToParsed` dropped every row (no url, no name).

### Detail of changes made:
- `src/lib/csv-to-lines.ts`: added `normHeader()` that lowercases + collapses
  `_`/`-` to spaces, applied in BOTH `parseCsvRows` and `csvToJobLines` header
  detection + mapping. Now `first_name`, `last_name`, `linkedin_url`,
  `work_email`, etc. all match. +2 tests; tsc + eslint clean.

### Potential concerns to address:
- The new-job form note ("N with email") can still mask rows that have no name;
  a future polish could warn when rows are unusable (no url + no name).

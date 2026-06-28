# Branch: `csv-run-name` — progress log

## Progress Update as of 2026-06-02
*(Most recent updates at top)*

### Summary
Name the job Export CSV after the run: "060226-[run-name]-export.csv"
(MMDDYY + slugified run title) instead of "profiles-scored-2026-06-02.csv".
The full-list view (no single run) keeps the legacy name.

### Detail
- `ProfilesScoredTable`: new `exportName` prop; exportCsv builds
  `${MMDDYY}-${slug(exportName)}-export.csv`, falling back to the old name when
  no run title. `[jobId]` page passes job.title. tsc+eslint clean.

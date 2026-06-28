# Branch: `job-rename` — progress log

## Progress Update as of 2026-06-02
*(Most recent updates at top)*

### Summary
Rename a list (scoring job) from its page via a hover pencil next to the title.

### Detail
- `PATCH /api/admin/jobs/[id]` (run_scoring_jobs grant + canAccessJob scope):
  updates `scoring_jobs.title`; empty → null ("Untitled run"). Title trimmed, max 200.
- `JobTitleEditor` client component: hover-revealed FiEdit2 pencil → inline input
  (Enter/Save → PATCH, Esc/Cancel → revert) → router.refresh().
- `[jobId]` page renders the editor for run_scoring_jobs viewers; plain `<h1>`
  otherwise. No migration (existing title column). tsc + eslint clean.

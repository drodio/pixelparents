# Branch: `job-run-history` — progress log

Branched from `main` on 2026-05-26.

Feature 1 (approved design): re-running a bulk scoring job creates a NEW run
(the original stays as history) instead of resetting it in place, and each
profile row shows when it was run + that run's own score.

## Progress Update as of 2026-05-26 5:55 PM Pacific
*(Most recent updates at top)*

### Summary
Re-run = clone-into-a-new-run; per-item score/cost snapshots keep each run
truthful (the eval is overwritten per re-score); added a "Run at" column.

### Detail of changes made:
- Migration `0015`: `scoring_job_items` += `founder_score`/`investor_score`/
  `combined_score`/`cost_cents` (snapshots); `scoring_jobs` += `rerun_of_job_id`
  (self-FK, on-delete set null). Applied to DEV. **PROD still needs 0015.**
- `lib/scoring-job-runs.ts` (+test, TDD): `cloneJobItemForRerun` (copy inputs,
  status by URL) + `runScore(snapshot, liveEval)` (snapshot wins; 0 is real;
  null → live).
- Worker (`scoring-tick`): on item done, snapshot `result` score + eval cost
  onto the item — so every run records its own numbers going forward.
- `POST /api/admin/jobs/[id]`: **clone** instead of reset — freeze the source
  run by backfilling snapshots from the current eval, then create a new
  `scoring_jobs` (`rerun_of_job_id` = source) with cloned items carrying
  `evaluationId` (worker reEvaluates in place). Returns the new job id.
- `GET …/[id]`: returns the item snapshot fields.
- `RerunButton`: confirms "as a NEW run", navigates to the new run's page.
- `JobProgress`: Score/Cost use `runScore(snapshot, live)`; new **"Run at"**
  column (item `completed_at`, local time); "↻ re-run of an earlier job" header
  link when `rerun_of_job_id` is set.

### Verification:
- TDD: `scoring-job-runs.test.ts` (6). tsc + eslint clean; /admin/score and the
  job-detail route compile (200). Full re-run→new-run flow to confirm in-browser.

### Potential concerns:
- **PROD migration `0015` must be applied** before this deploys (no auto-migrate).
- Re-run re-scores in place (one eval per URL) → the eval/leaderboard shows the
  latest run; per-run history lives in the job-item snapshots.

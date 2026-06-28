## Progress Update as of 2026-06-19 05:47 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Addressed roborev review (job 49, verdict F, both Low). Fix #1: the reaper now mirrors the claim query and only reaps items under a `queued`/`running` job, so a future terminal-but-not-`completed` job (e.g. `cancelled`) can't be dragged to `completed` and double-settle its credit hold. Fix #2: added `resolving`-branch and terminal-job-guard test cases.

### Detail of changes made:
- `reapStuckScoringItems` WHERE now includes `jobId IN (SELECT id FROM scoring_jobs WHERE status IN ('queued','running'))` (drizzle subquery).
- Declined the reviewer's GET-path integration test: `GET` claims and live-scores arbitrary `pending` rows against the shared dev DB → real Exa/Claude spend. The reap→finalize behavior is already covered at the function level (reap then `finalizeCompletedJob`), and the no-claim glue is a 2-line wiring; not worth the spend/network risk.
- Tests now 4 (scoring/resolving reaped, within-window skipped, terminal-job skipped); full scoring-tick suite green; `next build` clean.

---

## Progress Update as of 2026-06-19 05:36 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the bug where attendees (e.g. Jordan Lee + Alex Kim on event 6e515b68) kept showing the admin "SCORING…" chip indefinitely even though scoring was done. Added a reaper to the `scoring-tick` cron that fails items orphaned in `scoring` by a dead worker, so the parent job can finalize and the chip clears. bd issue ff-8j3.

### Detail of changes made:
- Root cause: `scoring-tick` atomically claims items by flipping `pending/resolved → scoring` with `started_at = NOW()`. If the cron function is killed mid-item (300s `maxDuration` timeout, deploy, or OOM) before the per-item `try/catch` runs, the item is stranded in `scoring`. The claim query only selects `pending`/`resolved`, so it's never reclaimed; `finalizeCompletedJob` counts `scoring` as still-pending, so the job stays `running` forever; and `getAttendeeScoringStatuses` (src/lib/event-attendees-admin.ts) keeps lighting the "SCORING…" chip because it matches any item under a `queued`/`running` job.
- Fix: `reapStuckScoringItems()` in `src/app/api/cron/scoring-tick/route.ts` marks any item in `scoring`/`resolving` whose `started_at` is older than `STUCK_SCORING_TIMEOUT_MIN` (15 min — deliberately > the 300s maxDuration so a still-alive overlapping tick is never reaped) as `failed`, bumps the job's `failedItems`, and returns affected job ids. Called at the top of `GET` before the claim; affected jobs are finalized even when nothing new is claimable.
- Chose to FAIL (terminal) rather than auto-requeue: an item that reliably blows the time budget would otherwise loop forever and burn spend. Admins re-run via the job's existing "Retry failed" action (src/app/api/admin/jobs/[id]/retry-failed/route.ts), which resets failed items to `pending`/`resolved` and re-opens the job.
- After the reap, the chip shows "FAILED" (truthful) instead of a phantom "SCORING…".
- Tests: `tests/app/scoring-tick-reaper.test.ts` — long-stuck item is failed + job finalizes; an item within the 15-min window is left untouched. Full scoring-tick suite (8 tests) green; `next build` clean.

### Potential concerns to address:
- One-time cleanup of the EXISTING stuck rows in prod (Jordan/Alex on event 6e515b68 and any others) is still pending an explicit go-ahead — the cron reaper will heal them within ~a tick once deployed, but a manual sweep clears them immediately. Prod DB write, so gated on confirmation.
- 15-min threshold is a constant; if `maxDuration` is ever raised above ~900s the threshold must rise with it, else a long-but-alive tick could be reaped mid-flight.

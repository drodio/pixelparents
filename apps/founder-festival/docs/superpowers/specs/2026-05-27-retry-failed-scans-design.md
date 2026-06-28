# Re-run failed scans (retry-in-place) — design spec

Date: 2026-05-27
Branch: `events-v1`
Status: approved (mechanism + scope chosen by the user via clarifying questions).

## Problem
A bulk scoring run can finish with some items in `failed` status (often transient —
PR #96's concurrency fix removed a big class of these). Today the only retry is the
full-job **Re-run** (clones every item into a new run). The user wants to re-run just
the **failed** scans in a run, e.g. `/admin/profiles/<jobId>` with several failures.

## Decisions (from the user)
1. **Retry in place** — reset the failed items in the SAME run back to a claimable
   state and re-queue the job; successful results are untouched. No new run created.
2. **Failed only** — items with status `failed`. `skipped` items (deliberate:
   dedupe / unresolvable) are left alone.

## How it works
The scoring tick (`/api/cron/scoring-tick`) atomically claims items whose
`status IN ('pending','resolved')` on jobs whose `status IN ('queued','running')`,
and on completion **re-derives** `completedItems`/`failedItems` from the item
statuses. So a retry only needs to:
1. For each `failed` item in the job: set `status = linkedinUrl ? 'resolved' : 'pending'`
   (a resolved URL skips re-resolution; otherwise re-resolve), clear `error`, and clear
   `startedAt`/`completedAt`.
2. Re-open the job: `status = 'queued'`, `completedAt = null`, and optimistically
   `failedItems = GREATEST(failedItems - <#reset>, 0)` (the tick recomputes it on the
   next completion anyway — this just makes the UI correct immediately).
The localhost auto-driver (and prod cron) then re-attempt the items; the live island
shows progress and `router.refresh()` pulls newly-scored profiles in on completion.

## Endpoint
`POST /api/admin/jobs/[id]/retry-failed` (new sub-route; the existing `POST
/api/admin/jobs/[id]` stays the full-job clone):
- `requireGrant("run_scoring_jobs")` → 403; `isUuid` → 400; job lookup → 404;
  `canAccessJob` (RBAC scope) → 403.
- No `failed` items → 400 `{ error: "no failed items to re-run" }`.
- Credit gate: `holdCreditsForJob(actor, retryEstimate)` where `retryEstimate =
  round(job.estimatedCents / job.totalItems) * <#failed>`; `insufficient` → 402 (same
  shape as the full rerun). No-op when enforcement is off (prod default).
- Returns `{ retried: <count>, jobId }`.

**Credit caveat (enforcement only; flagged off):** the hold is stored on the re-opened
job and reconciled against the job's CUMULATIVE `actualCents` on its next completion,
which can under-refund slightly for in-place retries (the original successful items'
cost is already in `actualCents`). Acceptable because enforcement is off and holds are
conservative; a precise fix would need delta-accounting. Documented inline.

## UI
- New client component `RetryFailedButton({ jobId, failedCount })`: confirms ("Re-run N
  failed scan(s)? real spend"), `POST`s the endpoint, surfaces a 402/insufficient or
  other error via `alert`, then `router.refresh()`.
- Rendered on the single-run view `/admin/profiles/[jobId]` header, shown when
  `canRun (run_scoring_jobs)` AND the job has `failedItems > 0`.
- `listProfilesForJob` extended to return `job.failedItems` so the server page can gate
  the button without a separate query.

## Out of scope
- A per-row "retry this one" control; retrying `skipped`; a Runs-panel retry button
  (the full Re-run already lives there). Could follow later.

## Testing
- `tests/app/retry-failed.test.ts`: seed a completed job (1 done + 2 failed, one with a
  linkedinUrl, one without) → POST → assert `done` untouched, the two `failed` reset to
  `resolved`/`pending` with `error` cleared, job `status='queued'`, `failedItems`
  decremented; plus a no-failed-items → 400 case and a no-grant → 403 case.
- Manual smoke on the linked run once shipped.

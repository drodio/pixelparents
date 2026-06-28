## Progress Update as of 2026-06-01 07:56 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Reworked Find Email from a synchronous inline route (which timed out on large
selections — ~6s/lookup × 100 sequential ≈ 579s vs the 300s limit) into an async
queue drained by a per-minute cron, so 516 / all ~1,700 eligible can be found in
the background with live progress.

### Detail of changes made:
- Schema: evaluations.find_email_queued_at / _queued_by / _billable (migration
  0029_overrated_scourge; applied to prod DB ep-fragrant-surf).
- POST /api/admin/profiles/find-email now ENQUEUES eligible selected rows (atomic
  UPDATE), returns {queued, queuedIds}. No inline AnyMailFinder calls.
- NEW cron GET /api/cron/find-email-tick (every minute, in vercel.json): atomically
  claims a BATCH=50 (FOR UPDATE SKIP LOCKED, clears queued_at), runs AnyMailFinder at
  CONCURRENCY=10, stores valid hits / marks misses not_found, charges billable rows on
  a hit (super-admins billable=false, captured at enqueue).
- NEW POST /api/admin/profiles/find-email/status: poll {remaining, found:[{id,email}]}.
- UI: Tools bar queues then polls every 4s, filling emails in live ("Finding… N found,
  M pending" -> "Found X of Y queued"). Survives navigation (cron keeps draining).
- src/lib/concurrency.ts runPool() + tests (3). Removed dead FIND_EMAIL_MAX_PER_CALL.

### Potential concerns to address:
- Branched off current main (has the #147 domain hotfix). Migration 0029 applied to
  prod DB; dev DB (ep-old-shadow) not migrated but not in the deploy path.
- AnyMailFinder rate limits at concurrency 10: transient errors leave rows untouched
  (re-queueable), not marked not_found. Watch tick logs for 429s.
- One more per-minute cron alongside scoring-tick; both cheap.

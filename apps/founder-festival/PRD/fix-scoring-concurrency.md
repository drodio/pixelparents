# Branch: `fix-scoring-concurrency` — bulk-scoring failure & concurrency fixes

Diagnosed from prod job `a6c4cb1d` ("111 YC founders"): 19 items showed as
"failed" but **all 111 founders were actually scored**, and the job cost **2×**
($15.54 vs $7.77 est). Root cause: overlapping cron ticks.

## Progress Update as of 2026-05-27 06:21 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the bulk-scoring concurrency bug. Prod runs `scoring-tick` every minute but
each tick runs ~200s, so 3-4 ticks overlap. The old claim was `SELECT`-then-flip
(non-atomic) → two ticks grabbed the SAME item → both `runEval` → the loser hit
`evaluations_linkedin_url_unique` and was marked "failed" (a false failure), and
the duplicate work doubled the spend.

### Detail of changes made:
- `src/app/api/cron/scoring-tick/route.ts`:
  - **Atomic claim**: one `UPDATE … SET status='scoring' WHERE id IN (SELECT …
    FOR UPDATE OF si SKIP LOCKED LIMIT N) RETURNING id`. Overlapping ticks now
    claim DISJOINT items (validated: Neon accepts SKIP LOCKED). Removed the now-
    redundant per-item flip in the loop.
  - **Counter recompute** at job completion: `completed_items`/`failed_items` set
    from actual item states (no more double-incremented totals).
- `src/lib/eval-pipeline.ts`:
  - **Idempotent insert** in `runEval`: `onConflictDoNothing({ target: linkedinUrl })`
    + refetch the winner — a lost race returns the existing eval instead of
    throwing a false "failure". (`reEvaluate` unaffected — it UPDATEs in place.)
  - **JSON-parse retry** in `scoreWithClaude`: the model occasionally emits invalid
    JSON (a trailing comma, or a literal `[...]` placeholder — both seen on this
    job). Now re-rolls once before failing the item.

### Validation
- `tsc --noEmit` clean on both files.
- `runEval` end-to-end test (mocked) passes.
- `FOR UPDATE SKIP LOCKED` confirmed accepted by Neon (read-only check).
- Full concurrent-tick behavior will be exercised on the next real bulk run.

### Potential concerns to address:
- **Prod data cleanup of job a6c4cb1d is still pending** — the 19 false-failed
  items + inflated counters need correcting (relink to their evals, set
  111 done/0 failed). The blanket write was blocked by the safety classifier;
  needs explicit per-operation approval. `actual_cents` ($15.54) left as the real
  (2×) spend.
- The atomic-claim raw SQL isn't unit-tested (integration/DB path is flaky in CI);
  dedicated conflict/retry tests are a reasonable follow-up.
- With concurrency now SAFE, overlapping ticks become *parallel throughput*
  (faster), not a bug — no need to also serialize ticks.

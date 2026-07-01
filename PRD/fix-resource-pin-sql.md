## Progress Update as of June 30, 2026 — 6:45 PM Pacific

### Summary of changes since last update
Fixed a HIGH bug (from #141): pinning a resource-board contribution always failed. setContributionPinned bound the string "now()" and cast it (`'now()'::timestamptz`), which Postgres rejects with "invalid input syntax". Branched the statement so pin uses real SQL now() and unpin sets NULL inline. Corrected the two tests, which had locked in the buggy behavior.

### Detail of changes made:
- lib/db/resources.ts setContributionPinned: pin -> `SET pinned_at = now()`; unpin -> `SET pinned_at = NULL`; both still scope WHERE id AND board_id.
- lib/db/resources.test.ts: assert the SQL contains `SET pinned_at = now()` / `SET pinned_at = NULL` and that "now()" is NOT a bound value.

### Potential concerns to address:
- Found by the automated page audit; part of a broader timezone/date-bug cleanup being addressed in parallel.

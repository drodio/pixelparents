# Percentile collapse — percentile-collapse

## Progress Update as of 2026-06-10 — Sprint 2 (P0-2 second half)
*(Most recent updates at top)*

### Summary of changes since last update
Collapsed the three per-profile percentile full-table scans into one
conditional-aggregate pass and switched the P0-2 SQL to the audit's single
covering index.

### Detail of changes made:
- New `computePercentilesAll({founder, investor, combined})` runs ONE scan with
  three `COUNT(*) FILTER` aggregates over the shared population predicate, instead
  of 3 separate `computePercentile` scans. Used on `/profile` (page.tsx) and the
  public API (`score-payload.ts`) — both needed all three dimensions.
- Extracted pure `percentileFromCounts(below, total)` (TDD, 4 tests) so the
  arithmetic is unit-tested and shared by both functions; `firstRow()` +
  `POPULATION_PREDICATE` helpers remove the duplicated result-parsing/where.
- `computePercentile` retained for the single-dimension caller (`/api/og`).
- `performance-indexes.sql`: replaced batch-3's three single-column partial
  population indexes with the audit's single PARTIAL COVERING index
  `evaluations_scored_pop_idx (founder_score, investor_score, score) WHERE
  signal_quality != 'low' AND source != 'code'` — index-only-scannable for the
  collapsed query. (Not yet applied to any DB; by-hand SQL.)

### Potential concerns to address:
- Index still pending a by-hand prod apply (and dev). It uses CREATE INDEX
  CONCURRENTLY — run statements individually, not in a txn.

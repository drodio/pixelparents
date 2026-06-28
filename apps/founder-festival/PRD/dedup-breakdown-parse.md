# Dedup breakdown parse — dedup-breakdown-parse

## Progress Update as of 2026-06-10 — Refactor: duplication consolidation (1/2)
*(Most recent updates at top)*

### Summary of changes since last update
Promoted the breakdown JSONB parse to a single dependency-free owner so the
legacy-array path can't silently drop investor rows.

### Detail of changes made:
- New `src/lib/breakdown-rows.ts` owns `founderRows`/`investorRows` (+ `BreakdownRow`):
  handles the `{founder,investor}` object shape AND a legacy flat array (= founder
  only, investor empty). Pure, no deps — client-safe.
- `credibility-vectors.ts` now re-exports from it (existing importers unchanged).
- `eval-pipeline.ts` `rowToResult` uses the shared helpers instead of its own
  inline array-vs-object branch (the divergent third copy that could mis-handle
  legacy rows).
- Left `ScoringLogButton.tsx` untouched: its `snapshot.breakdown` DTO is strongly
  typed to the new `{founder,investor}` shape (post-dates the legacy array) and
  uses a different `Row` type — routing it through the helper would only add a
  client-bundle import for no behavior change.

### Detail: TDD — 4 new tests in tests/lib/breakdown-rows.test.ts (object shape,
legacy array → founder/empty-investor, null, non-array key). 28 tests green.

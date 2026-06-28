# Leaderboard aggregate caching — leaderboard-aggregate-caching

## Progress Update as of 2026-06-10 — Perf P1-1
*(Most recent updates at top)*

### Summary of changes since last update
The anonymous leaderboard landing page recomputed its global, viewer-independent
aggregates on every hit. Now they're cached across requests with bounded staleness.

### Detail of changes made:
- `getBadgeCounts()` and `getIndustryCounts()` (both arg-less, global) wrapped in
  `unstable_cache` (revalidate 120s, tag `LEADERBOARD_COUNTS_TAG`).
- `getLeaderboardCounts(filter)`: the no-facet path (the default landing page) now
  serves a cached global total; facet-filtered counts stay live (unbounded facet
  space → not cached).
- Chose `unstable_cache` over `use cache` deliberately: `use cache` needs app-wide
  `cacheComponents`/`dynamicIO`, too invasive to flip for one optimization.
- NO write-path invalidation wired (keeps the hot scoring path untouched);
  staleness ≤120s on approximate sidebar counts is acceptable. The exported
  `LEADERBOARD_COUNTS_TAG` lets a future score-write call `revalidateTag` for
  instant busting if desired.

### Potential concerns to address:
- Counts can lag real data by up to 120s. If that's ever too stale, wire
  `revalidateTag(LEADERBOARD_COUNTS_TAG)` into the score (re)write + hide paths.

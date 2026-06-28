# Branch: `leaderboard-filtering` — progress log

## Progress Update as of 2026-05-31 9:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Split branch carrying **Plan 2 (faceted leaderboard filtering)** from the
`leaderboard-filtering-and-scoring` effort, opened as PR #143 to `main`. Merged
`origin/main` in to incorporate the scoring change (#142) and resolve the shared
PRD log; the full design context lives in
`PRD/leaderboard-filtering-and-scoring.md` and the plan in
`docs/superpowers/plans/2026-05-30-leaderboard-filtering.md`.

### Detail of changes made:
- Shared filter layer in `src/lib/leaderboard.ts`: `LeaderboardFilter` type,
  `parseLeaderboardFilter(URLSearchParams)`, `buildLeaderboardWhere(filter)`
  (OR within a facet, AND across), and `getLeaderboard(tab)` →
  `getLeaderboard(filter)` (role gate + facet WHERE + keyset-ready ordering on
  `(score, id)`).
- `src/lib/leaderboard-badge-sql.ts`: SQL predicates mirroring `computeBadges()`
  for 13 metrics-derived badges (`claimed`/`mm` deferred).
- Faceted sidebar (`LeaderboardFilters.tsx`) + mobile drawer; the Role facet
  replaces the old Combined/Founder/Investor tabs. Capital-raised/Team-size use
  threshold selects (slider is a polish follow-up).
- Migration `drizzle/0027_married_preak.sql` indexes `evaluations.company_stage`.

### Potential concerns to address:
- UI was not browser-verified locally (no DB connection in the dev worktree);
  verify on the Vercel preview.
- Migration `0027` must be applied (`db:push`) by an operator after merge.

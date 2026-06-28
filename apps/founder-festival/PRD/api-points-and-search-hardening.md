# API exposure + DoS hardening — api-points-and-search-hardening

## Progress Update as of 2026-06-10 — Sprint 1 batch 1 (API surface)
*(Most recent updates at top)*

### Summary of changes since last update
First batch of the 2026-06-10 audit fixes — the API-surface security items.

### Detail of changes made:
- **P0-3 (scoring-IP leak):** removed per-row `points` from the public API payload
  (`score-payload.ts` ScoreRow + credibility evidence; dropped the now-unused select).
  Overall/founder/investor scores + percentiles + each row's reason/confidence/status
  still returned. Added a `never leaks per-row point values` test (asserts no `"points"`
  anywhere in the serialized payload). Removed `"points"` from the `/developers` example.
- **P1-4 (search DoS):** `/api/v1/search` now caps query length (200) + adds a global
  daily circuit-breaker (`api-search`); `searchLeaderboard` caps tokens to 8 (each token
  AND-s an OR over 5 ILIKEs).
- **Security #4:** `getMatrixCandidates` now filters `isNull(hiddenAt)` — hidden profiles
  no longer surface as named matrix peers via `/api/v1/score`.
- **API #4:** clamp `raised_min/max` (≥0) and `team_min` ([0, INT4_MAX]) so a huge
  `team_min` returns empty instead of 500 (Postgres `::int` overflow).

### Remaining audit batches (this branch series): admin IDOR (org-badge + 12 event
sub-editors), misc quick wins (score-item points clamp, chat caps, delete _tmpseed.cjs,
perf indexes SQL), inbound-webhook sender verification, then Sprint 2 perf/reliability.

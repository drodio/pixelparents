## Progress Update as of 2026-06-06 11:25 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed a data bug surfaced by a famous chip-company founder ranking #14: the `founder_exit` rubric
used a public company's market cap AT IPO, so the chip company was scored at its 1999 IPO cap
(~$6B → 74 pts) instead of its current ~$3.5T. The rule now awards on the HIGHER of
current or IPO market cap (per DROdio — not peak).

### Detail of changes made:
- `src/lib/scoring.ts` — FOUNDER EXIT rule (IPO branch) now: look up CURRENT market
  cap for any still-public company, award on max(currentMarketCapUsd, ipoMarketCapUsd)
  (IPO acts as a floor). Updated the SEC-IPO block + extractedMetrics docs. New
  schema field `currentMarketCapUsd`.
- Doc → v0.0.14.
- 45 scoring/schema/curve tests pass; tsc clean.

### Scope (from the original-linear backup):
23 `founder_exit` rows use IPO-day caps. Companies that GREW (Reddit,
Cloudflare, DoorDash…) are underscored and will rise on rescore; companies that FELL
(Groupon) keep the IPO floor, no unfair drop.

### Potential concerns / next:
- RESCORE-to-apply: existing rows don't change until re-scored (the model must fetch
  the current cap). That founder stays #14 until their rescore — then jumps to ~#1
  (~$3.5T → ~1,775 sqrt). Can't rescore headless (no LLM key in worktree); rescore the
  23 via admin "Re-score" (~$3 total) or enable me to enqueue.
- No DB migration needed — currentMarketCapUsd lives in the profile.extractedMetrics
  jsonb.

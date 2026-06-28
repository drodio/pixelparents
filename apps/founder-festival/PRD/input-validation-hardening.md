# Input validation hardening — input-validation-hardening

## Progress Update as of 2026-06-10 — Sprint 1 batch 3 (input caps + cleanup)
*(Most recent updates at top)*

### Summary of changes since last update
Bounded the remaining unvalidated user/admin inputs from the 2026-06-10 audit,
removed a tracked debug seed, and added the P0-2 perf indexes to the by-hand SQL.

### Detail of changes made:
- **Event chat length caps** (`event-chat-shared.ts`): new `CHAT_TITLE_MAX=200`,
  `CHAT_BODY_MAX=5000`, and `chatLengthError()` (TDD: 5 new tests). Enforced in
  the thread-create and reply routes — these strings feed fire-and-forget mention
  emails, so unbounded text was an abuse vector.
- **Score-item points clamp** (`api/score-items/[id]` modify): admin-supplied
  `points` must be an integer within ±100, else 400. A row's points sum directly
  into founder_score, so junk values distorted the total.
- **Deleted `_tmpseed.cjs`** — a tracked (accidentally committed in #195)
  prod-capable debug seed that inserted test evals into whatever DATABASE_URL
  pointed at.
- **Perf indexes** (`scripts/sql/performance-indexes.sql`, apply to prod by hand):
  canonical_industries GIN (industry filter `&&` + unnest counts) and three
  partial population indexes baking in `signal_quality != 'low' AND source !=
  'code'` for the percentile/baseline scans (a plain composite btree wouldn't help
  — both predicates are non-sargable `!=`).

### Potential concerns to address:
- The new partial indexes still need to be run against prod (`psql
  "$DATABASE_URL_UNPOOLED" -f scripts/sql/performance-indexes.sql`) — confirm
  separately before running any prod DB action.
- `.env.example` reconciliation still pending (deferred from this batch).

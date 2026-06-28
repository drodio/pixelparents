## Progress Update as of 2026-05-28 10:08 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Adds recency data to the GitHub enricher and corresponding rubric rules so the "Technical Depth" credibility vector distinguishes "ships code TODAY" from "had a GitHub account 14 years ago" — directly the gap drodio called out about his own 95/100 score.

### Detail of changes made:
- `src/lib/enrichers/github.ts`:
  - Now fetches `/users/{login}/repos` twice in parallel: once sorted by stars (existing) and once sorted by `pushed_at` (new). Merges by repo name to avoid double-counting.
  - Adds `pushed_at` to the `GhRepo` type.
  - Emits two new facts: `"Most recent push: N days ago (X.Yy) — repo '...'"` and `"Repo push counts: N in the last 90 days, M in the last 12 months."` (or `"No public repo push activity detected"` when dormant).
  - Stores recency data in `raw`: `most_recent_push_at`, `pushed_in_last_90d`, `pushed_in_last_365d`.
- `src/lib/scoring.ts`: adds `GITHUB RECENCY SUB-RULES` block to `SCORING_RUBRIC`. Mutually exclusive tiers — apply at most one:
  - Recent ship (push <90d): **+15**
  - Active last year (push 90d–365d): **+8**
  - Dormant (no push 5+ years OR no detected activity): **−15**
- `PRD/scoring-rubric-v0.0.1.md`: documents the new tier under the GitHub builder sub-rules.

### Why this design:
- **Mutually exclusive** so a deeply active builder doesn't double-dip on +15 AND +8. Picking ONE row based on the bracket the most-recent push falls into.
- **Penalty for dormancy** because the existing rules (identified +3, active builder +5 for 10+ repos, tenured +3) currently fire on accounts that haven't pushed in a decade. drodio gets +11 just for existing on GitHub from 2011. A -15 dormancy offsets that pile-on.
- **No clamp exemption needed** — the +15/+8/-15 are well within the [-50, +200] guardrails.

### Potential concerns to address:
- **Private contributions are invisible** to the public REST API. A founder who ships heavily but only into private repos will show up as dormant. Acceptable for a public-credibility score, but worth noting. Adding the GraphQL `contributionsCollection` endpoint would surface private-but-counted activity (next iteration).
- **Existing eval rows scored before this PR** won't have the new fact lines and thus won't fire the new rules. On the next re-score the model will pick them up.
- **Rule attribution**: the recency facts go through `credibility-vectors.ts`'s existing `github|repositor|stars?|commits?` regex which already routes to Technical Depth. No change needed there.

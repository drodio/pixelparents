## Progress Update as of 2026-06-06 1:12 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The calibration fix DROdio approved: log-compress the dollar-magnitude founder rows
so the leaderboard reflects credibility, not company market cap. **PR is intentionally
NOT merged — gated on DROdio's approval of `k` + the prod recompute.**

### Detail of changes made:
- `src/lib/scoring.ts` — `dollarSignalPoints(usd, k)` = `max(1, round(k·(log10(usd)−6)))`
  and `curvedDollarPoints(rule, points)` (single source of truth; recovers usd from
  the linear points). k=40 outcome (valuation/exit), k=20 raise. $10M→40, $100M→80,
  $1B→120, $100B→200, $1.74T→250.
- `src/lib/eval-pipeline.ts` — `applyDollarLogCurve(scoring)` runs in `scoreInputs`
  before clamp/weighting; the model still emits linear floor(usd/$1M) so the figure
  is recoverable.
- `tests/lib/dollar-curve.test.ts` — 7 tests.
- `scripts/preview-dollar-curve.ts` — read-only leaderboard preview (old vs new).
- `scripts/recompute-dollar-curve.ts` — one-pass recompute of existing rows (DRY-RUN
  default; `--apply` writes). NOT run yet.
- `scripts/audit-calibration.ts` + `docs/audits/2026-06-06-scoring-data-audit.md` —
  the audit that found the problem.
- Doc → v0.0.12 + changelog.

### Preview result (872 prod profiles, 359 have a dollar row):
- Bill Gates 1,737,155 → 505 (#1→#2); credibility now beats size.
- Climbers: mitchell-hashimoto #31→#6, geoff-schmidt #75→#12, garry-tan #131→#10,
  joe-gebbia #121→#11, max-stoiber/daniel-stenberg/sarah-guo all rising.
- Serial founders (eric-lefkofsky) legitimately top out.

### Potential concerns to address:
- `k` is a judgment knob (outcome-vs-skill weighting). k=40 makes a mega-cap (~250)
  on par with a maxed skill axis. DROdio should confirm k before recompute.
- The live transform (merged) + existing rows (recompute) must go together or the
  leaderboard is briefly mixed (curved fresh rescores vs linear old rows). Hence:
  approve → merge + run `--apply` together.
- Recompute correctness relies on the dollar rules being clamp-exempt + authoritative
  (verified true), so founder_score shifts by exactly the row delta.

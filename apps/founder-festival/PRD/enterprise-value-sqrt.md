## Progress Update as of 2026-06-06 11:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Enterprise-value scoring moved from a LOG curve to a SQUARE-ROOT curve (no cap), per
DROdio. Log compressed too hard (Stripe only ~1.2× Groupon despite 7× the value, and
a serial founder's summed portfolio out-ranked a single generational company). Sqrt
makes a more valuable company worth proportionally more (Stripe ≈ 2.7× Groupon) and
lets generational founders far outscore everyone — which naturally fixes
Collison (#2/#3) > Lefkofsky (#9) WITHOUT best-company weighting.

### Detail of changes made:
- `src/lib/scoring.ts` — replaced the log curve with `enterpriseValuePoints(usd) =
  round(C·√usd)`, C so a $100B company ≈ 300 pts ($200M→13, $1B→30, $12.7B→107,
  $91.5B→287, $1.74T→1,250). `curvedDollarPoints` (the per-row hinge) now applies
  sqrt: outcome rows (valuation/exit) full weight, venture_raised ×0.5. No cap, no
  diminishing — companies sum.
- `src/lib/eval-pipeline.ts` — `applyDollarLogCurve` → `applyEnterpriseValueCurve`
  (same per-row mechanism, new curve).
- `tests/lib/dollar-curve.test.ts` — rewritten for sqrt (9 tests).
- `scripts/recompute-dollar-curve.ts` — now reads the ORIGINAL-linear backup (so it's
  idempotent / curve-agnostic) and rewrites prod.
- `scripts/preview-company-weighting.ts` — sqrt leaderboard model at 3 scales.
- Doc → v0.0.13.

### Verified (dry-run, 359 prod rows from backup):
bill-gates 1,505 · john-collison 491 (#2) · patrick-collison 474 (#3) · eric-lefkofsky
300 (#9) · mitchell-hashimoto 293 (#11). Matches the approved "$100B≈300" preview.

### Potential concerns to address:
- No cap means trillion-dollar companies score very high (Bill Gates 1,505) — this is
  intended (DROdio: generational founders should way outscore). Skill tops ~250, so
  a sub-$10B-company founder is below the generational tier by design.
- The original-linear backup `/tmp/dollar-curve-backup-prod-359.json` is the source of
  truth for re-deriving ANY curve; keep it. (If it's ever lost, re-derive from the
  reason text / extractedMetrics.)

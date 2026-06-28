# Branch: `developers-pricing-language` — progress log

Branched from `main` (post the founder-score-api-billing merge).

## Progress Update as of 2026-05-26 8:10 PM Pacific
*(Most recent updates at top)*

### Summary
The user wants the public "10× our measured cost" pricing claim gone
everywhere — replaced with softer, range-based language — and shipped
to prod.

### Changes (copy + customer-visible only; billing logic unchanged)
- `src/lib/developers/agent-guide.ts` — the agent API markdown:
  "The charge is 10× our measured cost of that scoring." →
  "The charge is variable and based on our average measured cost of
  that scoring (typically between $1 to $5 per record)."
- `src/lib/api/score-payload.ts` — API response `cost.basis`:
  `"10x_measured"` → `"measured"` (this string is returned to API
  consumers on every paid score).
- `src/lib/credit-pricing.ts` — reworded the doc comment so it no
  longer states "10x"; describes it as a markup framed publicly as
  "$1–$5 per record".
- `src/app/api/v1/score/route.ts` — reworded the header comment
  ("10x measured cost" → "the marked-up measured cost").
- `tests/lib/score-payload.test.ts` + `tests/lib/credit-pricing.test.ts`
  — updated the basis assertion + test description to match.

### NOT changed (deliberately)
- The actual billing multiplier `SCORE_MARKUP = 10` and `applyMarkup`
  are UNCHANGED — this was a copy request, not a pricing change. 10×
  the measured per-eval cost lands in the ~$1–$5 range, so the new
  public language is consistent with the real charge. If the actual
  charge formula should change, that's a separate explicit decision.
- `src/lib/scoring.ts` "(10×8)" — unrelated (a rubric example about
  scoring math, not cost). Left as-is.

### Verified
- `pnpm tsc --noEmit` clean.
- score-payload / credit-pricing / agent-guide tests pass. Remaining
  suite failures are pre-existing live-DB integration tests (redeem,
  eval-pipeline, account-delete-cascade) + other worktrees' stale
  copies — none related to this change.

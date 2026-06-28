## Progress Update as of 2026-05-28 08:06 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Ships **Scoring Rubric v0.0.4**: removes the +200 upper clamp from two rules where magnitude IS the signal, and rebalances their formulas. Driven by drodio's own profile, which capped at +200 for $84.9M raised — making a $20M raise score identically to a $200M raise.

### Detail of changes made:
- **Venture raised rule:**
  - Old: `+10 × floor($M)`, clamped to +200.
  - New: `max(1, floor($M))` when `totalRaisedUsd > 0`, NO upper clamp. Any verified raise gets at least +1 so seed founders register; $84.9M → +84; $1B → +1000.
- **GitHub top repo rule:**
  - Old: 6-tier table topping at +70 (50k+ stars).
  - New: `round(20 × log10(stars))` for repos with ≥100 stars, NO upper clamp. Calibrates to 100 → +40, 1k → +60, 10k → +80, 100k → +100, 1M → +120. Repos under 100 stars score 0 from this rule.
- **`clampBreakdown` change:** breakdown rows gain an optional `rule` field. When `rule` is `"venture_raised"` or `"github_top_repo"`, the row bypasses the upper +200 cap (the lower -50 still applies as injection protection). All other rules continue to be clamped to [-50, +200].
- **Schema change:** added `rule: RuleId | undefined` to the breakdown row Zod schema. `.catch(undefined)` on unknown values so a future rule rename can't break inference.
- **Prompt update:** rubric text in `SCORING_RUBRIC` rewrites both rule descriptions and tells the model to emit `rule: "venture_raised"` / `rule: "github_top_repo"` on those rows.
- **PRD doc:** `PRD/scoring-rubric-v0.0.1.md` updated to v0.0.4 with the new formulas + the clamp-exemption rule documented.
- **Tests:** `tests/lib/scoring-rubric-clamp.test.ts` covers: default rules clamp at ±200/-50, venture_raised uncapped on upper end, lower clamp still applies to venture_raised, github_top_repo uncapped, fractional truncation, unknown rule string falls through to default clamp.
- Full suite: **447/447 pass** (no flakes this run). `tsc --noEmit` clean.

### Potential concerns to address:
- **Existing eval rows don't have `rule` set** — they were scored before this change. On NEXT re-score, the model will emit `rule` for the relevant rows; until then, existing rows that hit the +200 cap stay capped. A bulk re-score after this lands would surface the corrected scores.
- **Outlier risk on the upper end** — a future $11B-raise founder (OpenAI-scale) would now score +11,000 from this row alone, dwarfing everything else. Acceptable given the user's data; can revisit if leaderboard distribution becomes unworkable.
- **GitHub formula sensitivity** — `20 × log10(stars)` was chosen because top OSS projects (FreeCodeCamp ~390k, React ~225k, Vue ~210k) land near +110-120. If we want top-repo founders to dominate more, raise the coefficient. Worth observing prod data before adjusting.
- **Test data leak source still needs to be addressed at the test-fixture level.** Vercel Development env now points at the dev Neon branch (fixed in this session), but local test runs that hit `DATABASE_URL` directly without going through Vercel's env are still a vector. A separate guard in the test setup that refuses to run if `DATABASE_URL` points at the prod host would close the door fully.

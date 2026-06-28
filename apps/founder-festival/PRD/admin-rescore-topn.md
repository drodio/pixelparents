# Branch: `admin-rescore-topn` — progress log

## Progress Update as of 2026-06-03 3:35 PM Pacific — top-N criterion in "Re-Score Existing"

### Summary of changes since last update
Added a "Top N by score" criterion to /admin/profiles/new → Re-Score
Existing, alongside the existing "Scored before date." When top-N is
selected the date is ignored: the job is built from the N highest-scored
profiles (filtered by the same Source checkboxes).

### Detail of changes made:
- `src/lib/profiles-scored.ts` — added `selectTopProfiles({ topN, sources })`
  and exported `TOP_PROFILES_MAX = 10_000`. Mirrors `selectStaleProfiles`
  semantics (source="url", score > 0, web/bulk/api derived from the same
  classifier) but orders by `score desc, id desc` and slices to topN AFTER
  filtering by source — so "Top 500 web-only" returns the 500 highest-
  scored web profiles, not "the top 500, then only web."
- `src/app/api/admin/jobs/route.ts` — extended `staleFilter` with
  `topN?: number`. Branch now requires exactly one of
  `notScoredSince`/`topN`; both or neither → 400. Job title for top-N runs:
  `"<N> <sources> profiles · top <N> by score"`.
- `src/components/admin/StaleRescoreForm.tsx` — added a "Criterion"
  segmented control at the top ("Scored before date" / "Top N by score").
  Date picker shows for date mode; number input shows for top-N. Both
  modes share Sources, Model, preview, submit. Preview matches the live
  count + cost for whichever criterion is active.
- `tests/lib/select-top-profiles.test.ts` — 5 new integration tests:
  score-desc ordering, top-N-of-source slice semantics, topN ≤ 0 → [],
  bulk excluded when only api is selected, sanity check on the cap.

### Verification:
- tsc + eslint clean on all touched files.
- All 5 new tests pass; all 10 pre-existing
  profiles-scored / stale-profiles-filter tests still pass.

### Potential concerns to address:
- `selectTopProfiles` fetches every eligible eval before slicing — fine
  at current scale (low thousands); a future window-function pre-cut
  would help if we ever need top-N from millions.
- TOP_PROFILES_MAX = 10,000 is a hard ceiling. The form clamps client-side
  and the API 400's anything above; if a legitimate use needs more, raise
  the constant rather than removing the check.

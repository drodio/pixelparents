## Progress Update as of [June 30, 2026 — 6:52 PM Pacific]

### Summary of changes since last update
First commit on this branch. Fixed the two social-proof count bugs from the
audit (findings 2 + 6): landing/`/signup` headline counts now exclude abandoned
draft signup rows, and the "N shared interests" headline is derived from the
same distinct pool that feeds the InterestTiles mosaic (so it can never read
smaller than the tiles on screen). Remaining 6 findings (3,4,5,7,8,9,10) still
to do; finding 1 (resources pin `now()`) is SKIPPED — already fixed in #143.

### Detail of changes made:
- `lib/db/signups.ts`: added exported `COMPLETED_SIGNUP_SQL` predicate
  (`extra->>'notified' = 'true'`) mirroring the marker `completeSignup` stamps.
  `getSignupCount` now filters on it; `getChildrenCount` counts only children
  whose family has a completed parent (correlated EXISTS); `getBuilderCounts`
  filters on `extra->>'notified' = 'true'`. Removed the dead child-only
  `getInterestsCount` (its child-only semantics were the finding-6 bug).
- `app/page.tsx` + `app/signup/page.tsx`: dropped `getInterestsCount()`; derive
  `interestsCount = interests.length` from the already-fetched `getInterestPool()`
  result so the headline and mosaic share one distinct set.
- Tests: `lib/db/signups.test.ts` rewritten to mock getDb and assert the count
  WHERE clauses filter on the completion marker (compiled via PgDialect).
  `lib/interests.test.ts` gained a group locking the "count = distinct pool size
  over parent+child union" invariant.

### Potential concerns to address:
- `submitSignup` (no-JS fallback POST) inserts a filled row but does NOT set
  `extra.notified`, so those rows won't be counted. That path appears unused by
  the live autosave UI; noted inline. If re-enabled it must stamp notified=true.
- Counts now depend on the completion marker; if the completion semantics change
  in actions.ts, update `COMPLETED_SIGNUP_SQL` in lockstep.

## Progress Update as of [June 30, 2026 — 6:56 PM Pacific]

### Summary of changes since last update
Second commit — landed the remaining 7 findings (3,4,5,7,8,9,10). All 10 audit
items are now resolved except finding 1 (SKIPPED — fixed in #143). Full suite
green (631 tests), tsc + lint clean.

### Detail of changes made:
- Finding 3 — `app/signup/thanks/page.tsx`: added an explicit not-found state
  when the `id` is missing/invalid (early return) OR the signup row doesn't
  exist (`!editData`). Removed the `id ?? ""` FamilyForm fallthrough; the form
  now always receives the real `validId`, so add/patch-child no longer silently
  no-op. Simplified now-guaranteed-non-null `signup`/`validId` guards.
- Finding 4 — `components/world-map.tsx`: tooltip flips BELOW the pin when the
  pin is within 40px of the top edge (drops `-translate-y-full`, uses a positive
  marginTop of `r + 8`), so high-latitude pins (Canada/UK/Norway/Alaska) no
  longer have their label cropped by the wrapper's overflow-hidden.
- Finding 5 — `components/profile-view.tsx`: grade line now guards against the
  "Not an OHS child" sentinel (mirrors the age line at :406), so a non-OHS
  child no longer shows that sentence styled as a grade.
- Finding 7 — `app/(authed)/directory/page.tsx`: `hasStats` now requires BOTH
  `stats` and `breakdowns` to be non-pending, and the WorldMap block only
  renders when `markers.length > 0` — no bare pin-less map under the heading.
- Finding 8 — `app/signup/thanks/family-form.tsx`: year-born range starts at
  the current year (26 entries) so a newborn (age 0) is selectable.
- Finding 9 — `app/(authed)/family/actions.ts` + `member-card.tsx`:
  `refreshBuilderStatus` takes an optional `username`, sanitizes + persists it
  via the authorized write, then counts against THAT value (no debounce race).
  The Check button passes the current typed `v.githubUsername`.
- Finding 10 — `app/developers/page.tsx`: endpoints intro softened to "Most
  endpoints require an approved key (the discovery, health, and OpenAPI
  endpoints are public)", consistent with the per-row "no key needed" labels.

### Potential concerns to address (this commit):
- Directory grid is 2-col; when the map is hidden the StatStrip occupies the
  wider first column — acceptable, but a future tweak could switch to 1-col.
- Did NOT run `next build` in the worktree (per instructions). tsc/lint/tests
  are the validation of record for this branch.

---

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

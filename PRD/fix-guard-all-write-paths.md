# fix/guard-all-write-paths

Closes the moderation holes left by #202.

## Progress Update as of [August 5, 2026 — 10:47 AM Pacific]

### Summary of changes since last update

#202 shipped guardWrite on 3 of 11 member write paths, and one of those 3 was
wired to the wrong function. This fixes both, adds a source-level coverage test
that catches the mistake class, and fixes a NULL comparison that broke Lift.
typecheck / lint / test (1001) / build all exit 0.

### Detail of changes made:

**The #202 bug.** `updateAskAction` had NO guard. The intended edit guard was
declared as `editGuard` but landed inside `createAskAction`, which therefore ran
the same check twice while editing skipped it entirely. So the exact bypass #202
claimed to close (edit a clean post into an ad; a muted member republishing by
rewriting an old post) was still open. Guard moved to `updateAskAction`, the
duplicate removed.

**Unguarded surfaces now covered** (a muted member could post freely on all of
these, and none filtered content):
- resources: createBoard, updateBoard, createContribution, updateContribution,
  addBoardChat, updateBoardChat
- events: createEvent, updateEvent

Contribution filenames are filtered too — member-supplied text other members see.

**Coverage test** (`lib/write-guard.coverage.test.ts`). Reads the action sources
and asserts every create/update/add/respondTo action calls guardWrite exactly
once. Verified against the pre-fix file: it fails with 3 errors naming
createAskAction (twice) and updateAskAction (missing). A behavioural test cannot
catch a call site nobody wrote — it would need one case per action, which is the
same list people forget to extend. It also asserts it matched >= 8 actions, so a
rename can't silently void every assertion.

**revokeEnforcement.** `eq(col, null)` renders as `= NULL`, never true, so the
first UPDATE always matched zero rows and every Lift fell through to the
unconditional fallback. Now `isNull()`, which also makes it idempotent (two
admins clicking Lift can't overwrite the first one's attribution). The fallback
now only reports: unknown vs already-lifted.

### Potential concerns to address:

- Profile free text is still unfiltered (`patchChild` notes/interests, signup
  profile fields). `patchChild` returns bare `{ok: boolean}` with no error
  channel, so doing this properly means a return-type refactor across the signup
  path — deliberately not bundled here.
- If filtering names is ever added, it should be admin-review, not a hard block.
  A false positive on a surname is unfixable by the family; one on "interests"
  is trivially editable.
- Content filter is English-only. WeChat-group advertising, the original parent
  complaint, is often not in English — the enforcement tools cover that case,
  the automatic filter does not.

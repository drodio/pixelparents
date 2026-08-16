# fix/share-fields-role-aware

## Progress Update as of [August 15, 2026 — 7:12 PM Pacific]

### Summary of changes since last update

The "choose what's visible" panel is now worded for whoever is looking at it.
Students no longer get a "Children" toggle, and their interests are labelled
"Your interests" rather than "Parent interests". typecheck / lint / test (1010)
/ build all exit 0.

### Detail of changes made:

- `lib/share.ts` — new `shareFieldsFor({ isStudent })`. Filters `children` out
  for students and relabels `interests`. Parents get today's list untouched.
- `app/signup/thanks/share-settings.tsx` — takes `isStudent` (defaults false so
  an un-updated caller can't accidentally hide a parent's Children toggle).
- Both call sites (`signup/thanks/page.tsx`, `account/page.tsx`) pass
  `isStudentAccount(signup)`.
- 5 new tests.

### The invariant worth protecting

Only LABELS and VISIBILITY are role-dependent. KEYS never change. Stored
`shareFields` values are keys, so nothing needs migrating and a member who
switches role keeps their saved choices. There's a test pinning this, because
getting it wrong would silently alter people's privacy settings.

### Potential concerns to address:

- Alums get the parent list today. They have no children on the platform either,
  so they arguably want the student treatment. Left alone deliberately: the
  walkthrough only covered students, and I'd rather not guess at a privacy
  default.
- The share PAGE renderer still decides what to show from the stored keys, so a
  student who had `children` enabled from before simply has nothing to render
  there. No data leak, just a dead key.

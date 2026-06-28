## Progress Update as of 2026-06-05 07:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Diagnosed why Sam Rivera still showed no HN/Tokenmaxxing signal in prod (his
breakdown was a single "+2 Stack Overflow" row; the "66" is a zero-heavy
percentile artifact). The v0.0.8a content-discovery only finds a handle when the
subject's OWN domain is in the Exa highlights — Sam's identifying HN domain is an
old blog modern search won't surface. Added a 4th identity tier: the tkmx
leaderboard itself.

### Detail of changes made:
- `src/lib/enrichers/hackernews.ts`: `resolveHnHandle` tier 4 `tkmx` —
  fetch tkmx `/api/users`, match the subject to an entry by a known handle OR a
  prefix-tolerant name match (`handleNameTokens` + `looseNameMatch`: exact last
  name, prefix-compatible first name, so "Samuel Rivera" ↔ `hn_username` "Sam_Rivera"),
  then confirm that hn_username against HN with bio corroboration. Exported the two
  matchers for testing.
- Verified live (no highlights): Sam → `Sam_Rivera` via `tkmx` (karma 4500);
  DROdio → `drodio` via `bio`. +5 unit tests; tsc clean.
- Doc → v0.0.8b changelog note (capture-only, no point changes).

### IMPORTANT — what makes it take effect:
The rubric only changes NEW scores. Existing profiles (Sam, DROdio, and the other
calibration targets) must be **RESCORED** after this deploys to pick up the
capture + v0.0.8 changes. That admin rescore is the one manual step.

### Potential concerns to address:
- tkmx tier fetches `/api/users` (~51 rows) per eval inside `resolveHnHandle`,
  which both HN + Tokenmaxxing call (duplicate, but parallel + cheap, best-effort).
- Name match is intentionally strict (exact last name) to avoid false positives on
  a 51-person board; bio corroboration is the final gate.

# Branch: `rescore-button-relocate` — progress log

Branched from `main` (post PR #47).

## Progress Update as of 2026-05-26 12:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged latest `main` — which already contained a related improvement
that landed in parallel: leaderboard link upgraded to "#N on
Leaderboard" (uses combinedP.rankFromTop) and ReScoreButton picked up
a new `variant="link"` plus `isOwner` + `fullName` props. Took main's
version since it's the more current contract. Resolved trivial
conflict in the score-display block.

## Progress Update as of 2026-05-26 12:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
QA: "Re-Score Me button just takes me to the leaderboard." Tracing the
flow, ReScoreButton's onClick handler POSTs `/api/rescore` and then
`router.push("/profile?e=<id>")` on success — it never navigates to
`/leaderboard`. Most likely cause: the button sat as a small uppercase
text link in the top-right HEADER while the BIG combined-score number
above is a hot-area link to `/leaderboard`, so a click meant for
Re-Score Me may have landed on the score-number's hit-area.

Fix: move the Re-Score Me link out of the page header and place it
inline next to "View on Leaderboard" under the combined score (where
the user reported expecting it). Header now only carries the
dev-mode Score Detail button. The two link affordances ("View on
Leaderboard" and "Re-Score Me") sit side-by-side separated by a
small middot, both styled as gold `.link`s.

Also gates the button on `isOwner || isAdminViewer` so it doesn't
appear for visitors who can't rescore anyway (matches the
`/api/rescore` ownership gate that landed in the security-hardening
PR).

### Files touched:
- `src/app/(authed)/profile/page.tsx`:
  - Removed `<ReScoreButton/>` from the header.
  - Added it inline next to "View on Leaderboard" in the score block,
    gated on owner/admin.

### Potential concerns:
- If the bug wasn't hit-target overlap and was instead a real failure
  inside `/api/rescore`, moving the button doesn't fix it. Next test
  pass: have the user open DevTools → Network and click Re-Score Me;
  if `POST /api/rescore` doesn't fire or returns a non-200, that's a
  separate ticket.

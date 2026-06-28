# Branch: `score-sort-and-rescore-disambig` — progress log

Branched from `main` (post PR #51).

## Progress Update as of 2026-05-26 1:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Three QA items from the same session:

0. **Splash hero — fix the over-crop from PR #51.** Adding
   `object-top` last round cropped off the tent + people (which sit
   in the bottom half of the source) and left only sky. Real fix:
   crop the SOURCE PNG to 1695×700 (down from 1695×928) so the
   reflection is physically removed, then revert to default
   `object-cover` (centered) so the whole non-reflection scene is
   visible again. Reflection starts at ~y=720 in the original; 700
   gives a clean safety margin.


1. **Sort score items by confidence (descending).** The founder and
   investor rubric tables were ordered by sort_order from the DB and
   then re-sorted client-side by points descending. User wants the
   most-confident items at the top. Now sorting on `confidence`
   descending (treating `rejected` as 0 so they fall to the bottom),
   with `points` descending as a secondary tie-break so big-impact
   items still bubble up among same-confidence rows.
2. **Re-Score Me button — disambiguate from "#N on Leaderboard".**
   User reports clicking "Re-Score Me" was taking them to the
   leaderboard. The code already claim-gates the Re-Score click
   correctly (non-owner → ClaimProfileModal opens, owner → rescore).
   Most likely a misclick: both the Re-Score Me button and the
   adjacent "#N on Leaderboard" link were styled identically (gold
   `.link` text) and sat side by side with only a tiny `|`
   separator. Restyled Re-Score Me as an outlined gold pill so it
   reads unambiguously as a BUTTON not a leaderboard link. Also
   added `preventDefault`/`stopPropagation` and explicit
   `type="button"` defensively, in case any nearby anchor (e.g. the
   giant `{score} → /leaderboard` element) was swallowing clicks.

### Files touched:
- `src/app/(authed)/profile/page.tsx` — `loadScoreItems` `.orderBy`
  changed to `desc(scoreItems.confidence), asc(scoreItems.sortOrder)`
  (two callsites, before-seed read and after-seed read).
- `src/components/ScoreTable.tsx` — `Section` sort changed from
  `b.points - a.points` to confidence-desc with points-desc as
  tie-break.
- `src/components/ReScoreButton.tsx` — onClick now preventsDefault +
  stopsPropagation, all `<button>`s have `type="button"`, and the
  `link` variant uses an outlined gold pill instead of `.link` gold
  text.

### Potential concerns:
- The new pill styling is more visually prominent than the previous
  inline gold text — if that turns out to be too much, easy to revert
  to a less-bordered look.

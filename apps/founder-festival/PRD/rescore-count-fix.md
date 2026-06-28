# PRD — rescore-count-fix

## Progress Update as of 2026-06-08 11:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the "Re-Score All (72)" vs "Queued 93" mismatch (Option A): the button now shows the
EXACT number the job will queue, by computing it from the same code path the route uses. No
schema/migration.

### Root cause
- Button counted `initialAttendees.filter(a => a.matched)`, where `matched` came from
  `getLeaderboardRowsForEvalIds` which **excludes low-signal profiles** — so the label
  undercounted.
- The route queued `resolveEventAttendeeEvalIds` (approved + non-removed + linked, incl.
  name-resolved) filtered to `source='url'` — no low-signal exclusion → more.

### Detail of changes made:
- `src/lib/events.ts`: new `getRescoreableAttendeeProfiles(eventId)` — the single source of
  truth for "who a re-score would touch" (matched/approved/non-removed/name-resolved, source=url).
- `rescore-attendees/route.ts`: refactored to use it (dropped the inline query).
- Admin event page computes `rescoreableCount = (await getRescoreableAttendeeProfiles(id)).length`
  and passes it to `AttendeeManager`.
- `AttendeeManager`: button label / confirm / disabled now use `rescoreableCount` (not the
  leaderboard-derived `matched`). The per-row "unmatched" tag is unchanged.

### Result
The button and the queued count are now guaranteed equal (same function). The per-row
"matched/unmatched" display still reflects leaderboard visibility, which can legitimately differ
from "will be re-scored" (low-signal profiles re-score but don't show on the leaderboard).

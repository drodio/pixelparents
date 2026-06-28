# PRD — sponsor-people-table

## Progress Update as of 2026-06-08 9:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
On the public recap, each sponsor's people are now shown as a **mini leaderboard-style table**
(name gold + company, badges, founder/investor/combined scores) instead of name pills — like the
Attendees table. No schema/migration.

### Detail of changes made:
- `src/components/events/ProfileMiniTable.tsx` (new): the shared leaderboard-style row table
  (name gold, company, badges, scores; blur + /?find=1 links for unclaimed; optional
  `defaultShown` "Load more"; optional `unmatchedNames`). Extracted from AttendeesTable so the
  attendees table and the per-sponsor table are guaranteed identical.
- `src/components/events/AttendeesTable.tsx`: refactored to a thin wrapper (title + membership
  prompt) around `ProfileMiniTable` (defaultShown=5). Same output as before.
- `src/lib/sponsors.ts`: `getSponsorPeopleRows(sponsorId)` → `LeaderboardRow[]` (sponsor's
  attached people via `getLeaderboardRowsForEvalIds`, sorted by combined score; dynamic import
  avoids a load-order cycle, like `getEventAttendeeRows`).
- `src/app/(authed)/events/[slug]/page.tsx`: sponsor section now fetches `getSponsorPeopleRows`
  per sponsor and renders `<ProfileMiniTable rows isClaimed={!unclaimed} />` instead of pills.
  Hosts keep their pills (only sponsors were requested).

### Potential concerns to address:
- Built off latest origin/main (events under `(authed)/events`, heavy churn from other sessions).
- Verify on prod where DECODE has Jerel + Shuo attached.

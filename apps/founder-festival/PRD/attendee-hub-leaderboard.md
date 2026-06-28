# PRD — attendee-hub-leaderboard

## Progress Update as of 2026-06-09 12:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The Attendee hub directory now shows each attendee as a leaderboard-style row (avatar, gold
name + company, badges, Founder/Investor/Combined scores) WITH the Connect button + connection
state. Heading renamed "Who else came" → "Connect with other attendees". Now sorted by combined
score (leaderboard order). No schema/migration.

### Detail of changes made:
- `src/lib/attendee-connections.ts`: `getEventDirectory` now enriches each entry with its full
  `LeaderboardRow` (`lb`) via `getLeaderboardRowsForEvalIds`, and sorts by combined score desc
  (fallback alpha). `DirectoryEntry` gains `lb: LeaderboardRow | null`.
- `src/components/events/AttendeeDirectory.tsx`: rows render leaderboard info (Avatar, gold
  name→profile, company, Badges, scores) + role badge + Connect/status/contact. Low-signal evals
  (no lb) fall back to name-only.
- `src/app/(authed)/events/[slug]/page.tsx`: heading → "Connect with other attendees".

### Potential concerns to address:
- Directory is attendee-gated, so verify visually as a signed-in attendee.
- Sort changed from alphabetical → combined-score desc (leaderboard-like); flip back if undesired.

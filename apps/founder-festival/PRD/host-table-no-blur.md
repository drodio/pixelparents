# PRD — host-table-no-blur

## Progress Update as of 2026-06-09 12:05 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
(1) Host people now render as the leaderboard-style mini table (like sponsors) instead of name
pills. (2) Sponsor + host people names are no longer blurred for logged-out/unclaimed viewers
(they're public info). The Attendees roster stays gated/blurred. No schema/migration.

### Detail of changes made:
- `src/components/events/ProfileMiniTable.tsx`: new `blurUnclaimed` prop (default true). When
  false, names/avatars/badges show to everyone and rows link to the profile (not /?find=1).
- `src/lib/hosts.ts`: `getHostPeopleRows(hostId)` → LeaderboardRow[] (mirrors getSponsorPeopleRows).
- `src/app/(authed)/events/[slug]/page.tsx`: hosts section now fetches `getHostPeopleRows` and
  renders `<ProfileMiniTable … blurUnclaimed={false} />` (removed the pills); sponsor table also
  gets `blurUnclaimed={false}`. Dropped the now-unused `profileHref` import.

### Potential concerns to address:
- Attendees table is intentionally still blurred/gated for unclaimed (kept default).

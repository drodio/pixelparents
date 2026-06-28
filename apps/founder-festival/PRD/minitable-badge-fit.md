# PRD — minitable-badge-fit

## Progress Update as of 2026-06-09 2:40 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed badges overflowing across the Attendees/sponsor/host tables — they now collapse to
"+N more" like the real leaderboard. Also fixed the attendee Connect cell to show "Connected ✓"
for approved connections (the model now sends an intro email instead of revealing contact, so
the old code fell through to a Connect button). No schema/migration.

### Detail of changes made:
- `ProfileMiniTable`: name column bounded with `minmax(0,1fr)` (was `1fr`, whose auto-min could
  grow to badge min-content); name block is now `flex-1 min-w-0` and the badges sit in a BLOCK
  container (was `inline-flex`, which is content-sized so the Badges "fit" expander couldn't
  measure a bound). Mirrors LeaderboardTable's NameCell.
- `AttendeesTable`: rowAction now handles `approved` → "Connected ✓" (approval emails an intro;
  contact is no longer revealed inline, so it must not fall through to a Connect button).

### Potential concerns to address:
- Badge collapse is client-measured (ResizeObserver in Badges); verify visually.

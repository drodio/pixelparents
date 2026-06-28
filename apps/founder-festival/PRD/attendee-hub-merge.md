# PRD — attendee-hub-merge

## Progress Update as of 2026-06-09 2:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Folded the separate "Attendee hub" box into the single Attendees section, made the attendee
list reuse the leaderboard-style table (ProfileMiniTable) with a per-row Connect button, and
replaced the granular connection prefs with one 3-way "Allow event connection requests?" choice
(per-event + a global default in /account). No schema/migration.

### Detail of changes made:
- `ProfileMiniTable`: optional `rowAction` slot — adds a trailing per-row control (Connect) and,
  when present, makes the name the link instead of the whole row. Badge-fit + Load more intact.
- `AttendeesTable`: now a client component; `defaultShown` 10; optional connect mode
  (`slug`/`viewerEvalId`/`connectionByEval`) renders a Connect button + state per row (skips self;
  shows contact when revealed). `Conn` type exported.
- `attendee-connections.ts`: `setConnectionChoice` (fans one choice across founder/investor/
  sponsor) + `connectionChoiceForScope` (read the single choice). `CONNECTION_GROUPS`.
- New `POST /api/connections/event-pref` { scope, choice }.
- New `EventConnectionPref` component (3 buttons: Auto-accept all / Review requests / Don't accept;
  per-event note + account link).
- Recap page: removed the top AttendeeHub box; for attendees the Attendees section now shows the
  pending-requests inbox + Connect buttons + the per-event pref. Deleted the now-unused
  `AttendeeDirectory`, `ConnectionPrefsPanel`, `ContactSharingToggle`.
- `/account`: new "Event connections" defaults section (global 3-way) for claimed users.

### Potential concerns to address:
- 3-way maps to existing per-group prefs (writes all 3 groups same); resolveAutoAction unchanged.
- Attendee section is gated; verify Connect + pref as a signed-in attendee.

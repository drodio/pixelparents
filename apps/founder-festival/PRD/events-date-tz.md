## Progress Update as of 2026-06-08 (merge) — date editor moved to consolidated page
*(Most recent updates at top)*

### Summary of changes since last update
Synced main: the recap admin page was consolidated INTO /admin/events/[id]
(/recap is now a redirect). Moved the EventDateEditor "Date & time" section from
the old recap page to the consolidated event admin page (first section of the
"Recap & content" block). Recap page resolved to main's redirect. Build clean.

## Progress Update as of 2026-06-08 — events date TZ fix + manual date editor
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the off-by-one event date on /admin/events and added a manual date/time
editor to the event recap admin page. Fresh branch off origin/main (the old
worktree-admin-3005 branch had accumulated heavy merge cruft).

### Detail of changes made:
- **Off-by-one bug:** `events.starts_at` is a UTC instant (timestamptz). The
  admin list (src/app/(authed)/admin/events/page.tsx) formatted it with
  `toLocaleDateString` and NO timeZone → rendered in the server's UTC, so an
  evening Pacific event (e.g. June 1 ~7pm PT = June 2 UTC) showed +1 day; a
  daytime event (Summer Solstice June 2) stayed correct. The PUBLIC pages
  (events list + event page) already pinned America/Los_Angeles, so only the
  admin list was wrong. Fix: new `src/lib/event-format.ts` (EVENT_TZ =
  America/Los_Angeles + formatEventDate/Long/DateTime); admin list uses
  formatEventDate.
- **Manual date editor:** new `EventDateEditor` (datetime-local for starts/ends,
  edits in the admin's browser/Pacific tz, sends ISO) + `POST
  /api/admin/events/[id]/date` (requireGrant manage_events, validates,
  updates startsAt/endsAt). Added as the first section on the recap page
  (admin/events/[id]/recap).

### Potential concerns to address:
- No events timezone column — everything assumes Pacific (festival tz). If events
  ever span regions, add a tz column and thread it through event-format.ts + the
  editor. The datetime-local editor uses the admin's BROWSER tz (Pacific for the
  team), consistent with the existing EventCriteriaBuilder.

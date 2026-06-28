# PRD — events-hide-location

## Progress Update as of 2026-06-05 11:31 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. (1) Hide the event location/venue on event pages: removed the venue
line from the event detail page. (The /events listing cards already showed only
title/date/host — no location there.) (2) Added `scripts/delete-event.ts` to
delete a single event by slug or Luma id (cascade-safe), e.g. to remove the
"Hello World" placeholder Luma event.

### Detail of changes made:
- `src/app/events/[slug]/page.tsx`: removed `{event.venue && <p…>{event.venue}</p>}`
  from the header. Venue no longer renders on upcoming or past event detail pages.
- `scripts/delete-event.ts` (new): `--slug=` | `--luma=`, `--target=dev|prod`,
  `--dry`/`--confirm`. Nulls `bypass_codes.event_id` then deletes the event (children
  cascade). Warns when the target is a Luma event (re-syncs unless removed from Luma).

### Context (this session, ops on prod):
- Deleted 348 test-suite "events" rows that had leaked into prod (all non-Luma);
  the real 5 Luma events were synced (operator clicked "Sync from Luma") and
  preserved. Past events now appear on /events.
- The "Hello World" event is a Luma placeholder (slug `founder-qoeu`) slated for
  deletion — must also be removed from Luma or it re-syncs.

### Potential concerns to address:
- No admin UI to delete an event yet (only photos/sponsors/hosts have deletes) —
  event deletion is script-only for now.

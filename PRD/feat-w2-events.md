## Progress Update as of [June 30, 2026 — 6:28 AM Pacific]

### Summary of changes since last update
First entry. Built the full **Events** feature as its own dashboard tab: a shared
OHS community calendar with a month-grid + list views, create/edit/delete of
community events, per-event organizers (admins) with live name autocomplete,
going/interested RSVPs with privacy-aware attendee names, per-event "Add to
calendar" (.ics download + Google Calendar link), and an idempotent auto-import of
the Stanford OHS school-year calendar (source='ohs', read-only) wired to a Vercel
cron + a runnable script.

### Detail of changes made:
- **Data model** — NEW `lib/db/schema/events.ts`: `events` (title, description,
  starts_at/ends_at timestamptz, is_online, location, online_url, all_day, source
  'user'|'ohs', author_signup_id nullable, author_label, external_key for OHS
  de-dup), `event_admins` (event_id, signup_id), `event_rsvps` (event_id,
  signup_id, status 'going'|'interested'). Registered in
  `lib/db/schema/index.ts`. Self-healed idempotently via NEW `ensureEventsSchema`
  in `lib/db/ensure.ts` (CREATE + ALTER ADD COLUMN IF NOT EXISTS + partial unique
  index on external_key + unique (event,signup) on rsvps/admins). EVERY read/write
  path in `lib/db/events.ts` calls the ensure first (the country-column P0 lesson).
- **Data layer** — NEW `lib/db/events.ts`: range/all reads, grouped RSVP counts,
  per-viewer RSVPs, editable-event-id set, admin membership, create (creator auto-
  added as admin in a txn), update/delete guarded to source='user', RSVP upsert,
  add/remove admin, OHS upsert-by-external_key, plus member-name search +
  getSignupById for the add-admin autocomplete.
- **Pure libs** (`lib/events/*`, all unit-tested):
  - `ics.ts` — from-scratch RFC-5545 generator (CRLF, text escaping, 75-octet line
    folding, DATE vs DATE-TIME) + a Google Calendar render-link builder.
  - `ohs-parser.ts` — parser for the OHS calendar's "Weekday, M/D[ – M/D] — Title"
    format (Aug→Jun academic-year month→year resolution, en/em/hyphen ranges, TBD/
    header skip), an HTML-line extractor, and a CURATED SEED of the real 2026–27
    school-year dates as fallback.
  - `import-ohs.ts` — fetches the live OHS gateway page, parses it, falls back to
    the seed if unreachable/unparseable, and upserts; returns a {source, parsed,
    upserted} report.
  - `calendar.ts` — month-grid builder (42-cell 6×7), day-overlap math (multi-day
    spans), upcoming/past split, "this week" highlight selection.
  - `validate.ts` — title/description/location/url validators (rejects non-http(s)
    schemes), local-date+time+tz-offset → UTC instant resolver, range validator.
- **UI** (`app/(authed)/events/**`):
  - `page.tsx` — gated calendar surface (verified OHS families only, mirrors
    Community); loads events + counts + my-RSVPs + editable set, maps to plain
    CalendarEvents.
  - `events-calendar-client.tsx` — month grid w/ prev/next/today, calendar↔list
    toggle, Upcoming/Past tabs, online/in-person + OHS filters, "happening this
    week" strip, day + event detail slide-over drawers.
  - `event-form.tsx` + `new/` + `[id]/edit/` — create/edit (all-day toggle,
    optional end, online-URL vs location); OHS events are not editable (guarded
    server + route).
  - `[id]/page.tsx` — detail page w/ RSVP, add-to-calendar, who's-coming sidebar
    (names only for directory-shared members; others counted anonymously),
    organizer manager.
  - `[id]/admin-manager.tsx` — add-organizer input with debounced live autocomplete
    of EXISTING accounts (server action), pinned non-removable creator.
  - `[id]/event-controls.tsx` — edit + confirm-delete. `add-to-calendar.tsx`,
    `event-bits.tsx` (RSVP control + when/place formatters), `gate.tsx`, `shared.ts`.
  - `actions.ts` — all server actions, authorized entirely server-side from the
    Clerk session; verified-family gate; create rate limit; OHS-immutability guards.
- **Nav** — added an "Events" tab (calendar icon) to `dashboard-shell.tsx` right
  after Community. NEW icons in `components/icons.tsx`: calendar, map-pin, video,
  plus, star.
- **OHS import wiring** — NEW `app/api/events/import-ohs/route.ts` (GET+POST,
  CRON_SECRET-guarded), NEW `scripts/import-ohs-events.ts` (runnable), and a daily
  Vercel cron in `vercel.json` (`0 7 * * *`).
- **Tests** — 53 passing unit tests across ics, ohs-parser, validate, calendar,
  import-ohs (live-HTML parse). `npx tsc --noEmit` clean, `npm run lint` clean.
  `npm run build` verified by copying changed files into the main checkout
  (`/Users/main/stanfordohs/pixelparents`) — all four /events routes + the import
  API compiled — then restoring main to pristine (worktree symlinked node_modules
  breaks build/dev directly, as the directives warned).

### What the OHS import actually does (+ limitation)
The OHS gateway page (school-year-calendar-gateway) exposes NO iCal/.ics feed, no
Google embed, no JSON — it's plain HTML listing date+title rows by semester. So the
importer fetches that HTML, strips it to lines, and runs the same date parser used
on the curated seed. If the live fetch fails or yields zero parseable events, it
falls back to the curated seed (the real 2026–27 dates transcribed from the page).
LIMITATION: the parser targets the page's current "Weekday, M/D — Title" shape and
the live academic year is pinned (OHS_LIVE_ACADEMIC_YEAR_START) — both need a touch
each August when the page rolls over; the seed guarantees a correct calendar
meanwhile. Undated "TBD" entries (e.g. Pixel Festival) are intentionally skipped
(no date to place) rather than invented.

### Advanced extras added
- "Happening this week" highlight strip on the calendar.
- Online vs in-person filters + an OHS-calendar on/off toggle.
- Calendar ↔ list view with Upcoming/Past tabs.
- Day + single-event slide-over detail drawers (no full navigation needed).
- Privacy-aware attendee list (names only for directory-shared members; the rest
  counted anonymously), mirroring the directory's minor-privacy coarsening.

### Potential concerns to address:
- OHS parser is coupled to the page's current markup/wording; revisit each new
  school year (update the seed + OHS_LIVE_ACADEMIC_YEAR_START). The seed fallback
  de-risks this.
- Edit round-trips compute the form's date/time from the stored UTC instant in the
  SERVER's zone; a creator editing across a DST boundary in a very different zone
  could see a small offset. Acceptable for v1; a stored origin-offset would make it
  exact.
- RSVP counts are eventually-consistent with optimistic client updates; a failed
  action refreshes from the server.

## Progress Update as of 2026-06-12 (afternoon Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Two small admin-events improvements DROdio requested: (1) the /admin/events
index now shows a separate "Upcoming events" table and a "Past events" table below it,
and (2) event slugs may now contain hyphens, underscores, and plus signs.

### Detail of changes made:
- **Events page split** (`src/app/(authed)/admin/events/page.tsx`): extracted the table
  into a local `EventsTable` component and rendered it twice — UPCOMING (future or
  undated, soonest-first, undated sinks to the bottom) and PAST (real start date in the
  past, most-recent-first). Each section has a heading with a count + its own empty state.
  Same query (one fetch, split in JS); no behavior change to rows themselves.
- **Permissive event slugs** (`src/lib/slugify.ts`): added `slugifyEvent` + `isValidEventSlug`
  which keep `-`, `_`, and `+` verbatim (collapse only OTHER invalid runs to `-`, trim
  edge separators, cap 60). The global hyphen-only `slugify`/`isValidSlug` are UNCHANGED
  (hosts/sponsors + name-derivation still rely on them).
  - `EventSlugEditor.tsx` onChange now uses `slugifyEvent` (so you can type `_`/`+`).
  - `POST /api/admin/events/[id]/slug` validates with `slugifyEvent` + `isValidEventSlug`
    and updated its error copy.
  - Safe: `getEventBySlug` does an exact-match lookup (no canonical re-slugify), so a
    `+`/`_` slug resolves fine; `+` is literal in a URL path segment.
- Tests: `tests/lib/slugify-event.test.ts` (5) — permissive keep/collapse/trim/validate +
  a guard that the global `slugify` is unchanged. tsc clean; 25 slug/event tests pass.

### Potential concerns to address:
- Changing an event slug still breaks previously-shared `/events/<old-slug>` links (no
  slug-history redirect) — already surfaced to the admin in the editor, unchanged here.

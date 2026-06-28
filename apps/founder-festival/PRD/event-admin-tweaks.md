## Progress Update as of 2026-06-09 1:10 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Three admin event-page tweaks: cleaned up the date editor (no help blurb, timezone label, click-to-open native picker), removed the recap description paragraph, and made the event slug editable + name-derivable.

### Detail of changes made:
- `src/components/admin/EventDateEditor.tsx`:
  - Removed the "Shown in Pacific time… entered in your local timezone." paragraph.
  - "Starts at" / "Ends at" labels now show the browser's short timezone (e.g. `Starts at (PDT)`), detected client-side via `Intl…timeZoneName: "short"`; the label spans use `suppressHydrationWarning` (server renders no tz).
  - Clicking either field calls `input.showPicker()` to open the native calendar/time picker (wrapped in try/catch; typing still works where unsupported).
- `src/app/(authed)/admin/events/[id]/page.tsx`:
  - Removed the "Photos, hosts, sponsors, priorities, and learnings shown on the public recap at /events/<slug> ↗" paragraph under the "Recap & content" header.
  - Replaced the static `Slug <code>…</code>` in the header with the new `EventSlugEditor`.
- New `src/lib/slugify.ts` — DB-free `slugify()` + `isValidSlug()` (same rules as the private one in luma-sync; "Summer Solstice Founder + Investor Day" → "summer-solstice-founder-investor-day"). Client- and server-safe.
- New `src/app/api/admin/events/[id]/slug/route.ts` — `POST { slug }`, `manage_events` grant, normalizes via `slugify`, enforces the `events_slug_unique` index with a friendly 409, updates `events.slug`.
- New `src/components/admin/EventSlugEditor.tsx` — inline editor: `festival.so/events/<input>`, a "Use event name" button (slugifies the title), Save, `router.refresh()` on success, and a warning that changing the slug breaks previously shared links.

### Potential concerns to address:
- No slug-history/redirect: changing a slug 404s any previously shared `/events/<old-slug>` link. The editor warns the admin; a redirect table is a possible follow-up if link stability matters.
- Accented names decompose oddly via NFKD ("Héllo" → "he-llo"), matching the existing luma-sync slugify — consistent app-wide, but not perfect for non-ASCII titles.
- `showPicker()` support varies by browser/version; it's a progressive enhancement over the always-available native typing + calendar icon.

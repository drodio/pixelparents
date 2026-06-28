# Re-Import from Luma + editable description

## Progress Update as of 2026-06-12 11:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admins can re-import a Luma event's details (title, description, cover, date, venue) with one
button, and edit the description inline. (Title was already editable via EventTitleEditor.)

### Detail of changes made:
- `lib/luma-sync.ts` `reimportLumaEvent(eventId)`: finds the event on the Luma calendar by its
  stored `lumaEventId` and overwrites title/startsAt/endsAt/venue/description/lumaUrl/coverUrl
  with the current Luma values. Leaves slug + admin content (learnings/photos/hosts) alone.
- `POST /api/admin/events/[id]/reimport-luma` — admin-gated; calls the above.
- `PATCH /api/admin/events/[id]/details` — edits title and/or description (title required).
- `ReimportLumaButton` (admin) in the event header (Luma events only) → confirm → POST → full
  reload so the editors show the refreshed values. Links to the lu.ma page.
- `EventDetailsEditor` (admin) — description textarea, debounced autosave to /details. New
  "Description" section in the admin event page. Title editing stays in EventTitleEditor.

### Potential concerns to address:
- Re-import OVERWRITES title + description with Luma's — intended (the ask is to pull fresh).
  Admin edits to those fields are replaced on re-import; learnings/photos are not touched.
- Attendee guest-list sync is a separate existing flow; this re-import covers event details only.
- Required `pnpm install` after merging main (the `marked` dep was new and out of sync locally).

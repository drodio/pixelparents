# Photo system upgrades (cover, reorder, captions, attendee UX)

## Progress Update as of 2026-06-09 11:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
PR3: LLM auto-caption for admin photos — per-photo "Re-Run", a bulk "Auto-caption all"
that skips manually-captioned photos, and an "X" to clear a caption. Adds a migration.

### Detail of changes made:
- Migration `0041_jittery_marvel_boy.sql`: `event_photos.caption_manual boolean default false`.
  Apply via `node scripts/apply-caption-manual.cjs` (dev: .env.local; prod: pass
  `/Users/drodio/Projects/founder-festival/.env.prod.local`). The script falls back to
  `POSTGRES_URL_NON_POOLING` because prod env files redact `DATABASE_URL*`. Dev applied
  2026-06-09 (host ep-old-shadow). MUST be applied to prod BEFORE this code deploys.
- `lib/photo-caption.ts`: `generatePhotoCaption()` — vision call (anthropic/claude-sonnet-4-6
  via AI Gateway) grounded in event title + description + learnings; returns "" on failure.
- Routes: `POST .../photos/[photoId]/caption` (re-run one, always runs, resets to auto),
  `POST .../photos/caption-all` (captions every non-manual photo, concurrency 4).
- PATCH route: a human caption edit sets `caption_manual=true`; clearing sets it false.
- `EventPhotoManager`: "✨ Auto-caption all" button + hint; per-photo "✨ Re-Run caption" /
  "Auto-caption" link; "✕" clear button; caption input keyed by caption so AI results render.
- `getEventPhotos` + admin mapping + `AdminPhoto` carry `captionManual`.

### Potential concerns to address:
- Auto-caption is vision-LLM and costs tokens per photo; "Auto-caption all" on a big set is
  the priciest action. Gated to admins; runs only on click.
- Captions describe only what's visible; the model is told not to invent unseen details.

### Still queued (subsequent PRs):
- Attendee uploader redesign: "Choose Photos" → staged grid with per-photo caption + visibility
  + "X", auto-caption on the attendee side, then "Upload Photos".
- @mention members in captions, clickable to profiles.

## Progress Update as of 2026-06-09 10:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
PR2: cover-as-first-photo + drag-to-reorder. The Luma cover is now materialized as
a real, draggable, captionable photo row; the first photo in the set is the cover.

### Detail of changes made:
- `lib/events.ts`: `ensureLumaCoverPhoto(eventId, coverUrl)` idempotently inserts the
  Luma cover as an `event_photos` row (source `luma_cover`, sortOrder = min-1) the first
  time an admin opens the event. `reorderEventPhotos(eventId, ids)` sets sortOrder = index
  via `db.batch`.
- New route `POST /api/admin/events/[id]/photos/reorder` ({ ids }) — admin-gated.
- Admin event page calls `ensureLumaCoverPhoto` before fetching photos; help text now says
  "Drag to reorder. The first photo is the cover."
- `EventPhotoManager`: HTML5 drag-to-reorder (only the image is draggable so caption inputs
  stay editable), optimistic local reorder + persist, "Cover" badge on the first photo.
- Recap (`events/[slug]/page.tsx`): only prepends `event.coverUrl` as a virtual slide while
  it isn't yet a materialized photo row, to avoid a duplicate cover.

### Potential concerns to address:
- `ensureLumaCoverPhoto` is a write on the admin GET render; idempotent by blobUrl check, but
  two simultaneous admin loads could race a double-insert (rare; no unique constraint).

## Progress Update as of 2026-06-09 10:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
PR1 (this branch's first ship): fixed the attendee photo-upload size error and unified
the visibility dropdown to three options on both the admin and attendee sides.

### Detail of changes made:
- `AttendeePhotoUpload.tsx`: now runs `resizeImageForWeb()` on each file before the
  Blob client-upload (same as the admin path), fixing the "File is too large, the file
  length cannot be greater than 26214400 bytes" error attendees hit with phone photos.
- Visibility choices unified to **Public / Members Only / Attendees Only** everywhere:
  attendee uploader (was only "Visible to everyone"/"Attendees only"), admin upload row,
  and admin per-photo dropdown. DB values unchanged (`public` | `claimed` | `attendees`).
- `api/events/[slug]/photos/route.ts`: attendee POST now accepts `claimed` (Members Only)
  in addition to public/attendees.

### Still queued on this branch (subsequent PRs):
- Cover photo = first photo in the set; pull the Luma cover in as a regular photo; drag to
  reorder photos (admin).
- Attendee uploader redesign: "Choose Photos" → staged grid with per-photo caption +
  visibility, then "Upload Photos".
- LLM auto-caption (event description + learnings as context): per-photo "Re-Run" + a
  "Re-Run all" that skips manually-captioned photos; an "X" to clear a caption (both sides);
  auto-caption available on the attendee side too.
- @mention members in captions, clickable to their profiles.

### Potential concerns to address:
- `event_photos.visibility` "claimed" gating must be honored consistently in the recap's
  locked-photo logic now that attendees can pick it.
- Auto-caption needs a new column (e.g. `caption_manual`) to know which captions to skip on
  "Re-Run all" — that PR will carry a migration.

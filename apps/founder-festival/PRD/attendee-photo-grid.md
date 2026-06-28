# Attendee photo uploader redesign (staged grid + auto-caption)

## Progress Update as of 2026-06-09 12:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Rebuilt the attendee "Add Your Photos" flow into a staged grid: choose photos, review
each with an auto-suggested caption + visibility, then "Upload Photos".

### Detail of changes made:
- `AttendeePhotoUpload.tsx` rewritten:
  - Pill → panel with a single "Choose Photos" button (no caption/visibility prompts up front).
  - On choose: each photo is resized + pushed to Blob immediately (so it can be auto-captioned),
    shown in a grid with a preview, an auto-suggested caption (editable, "✕" to clear,
    "✨ Re-Run"/"✨ Auto-caption"), a Public/Members Only/Attendees Only selector, and an "×"
    to remove the photo from the batch.
  - "Upload Photos" publishes all ready items via the existing `POST /api/events/:slug/photos`
    (blobUrl + caption + visibility); only then do they become event photos. "+ Add more" too.
- New `POST /api/events/[slug]/photos/caption` — stateless, attendee-gated; returns a suggested
  caption for a blobUrl using the same `generatePhotoCaption` (event title + description +
  learnings). No DB write.

### Potential concerns to address:
- Photos are pushed to Blob on "choose" (before final save) so we can caption them. If the
  attendee removes one or closes without "Upload Photos", that blob is orphaned (no DB row,
  not shown). Minor storage cost; no cleanup job yet.
- Auto-caption runs one vision call per chosen photo (attendee-triggered). Gated to attendees.

### Still queued:
- @mention members in captions, clickable to their profiles (admin + attendee).

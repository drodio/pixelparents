# PRD — attendee-photos

## Progress Update as of 2026-06-09 3:20 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Attendees can now add their own photos to an event. A gold-outline "+ Add Your Photos" pill
shows under the carousel (attendees only); it expands into a small uploader (file picker +
Everyone/Attendees-only visibility). Reuses the same Vercel Blob client-upload flow as admin.
No schema/migration (event_photos already supports source/uploadedBy/visibility).

### Detail of changes made:
- `POST /api/events/[slug]/photos/upload` — Blob client-upload token handshake, gated by
  isEventAttendee (mirrors the admin handshake).
- `POST /api/events/[slug]/photos` — records the blob URL with source="attendee",
  uploadedByEvaluationId=viewer, visibility public|attendees; attendee-gated; validates the URL
  is from our Blob store.
- `src/components/events/AttendeePhotoUpload.tsx` — the gold-outline rounded-full pill + an
  expandable uploader (client `upload()` → record → router.refresh()).
- Recap page renders `<AttendeePhotoUpload>` right under the carousel for `viewer.isAttendee`.

### Potential concerns to address:
- Needs BLOB_READ_WRITE_TOKEN in prod (already set — admin uploads work).
- Attendee photos default to "Visible to everyone"; admins can still manage/remove them.

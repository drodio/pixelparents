# PRD — photo-credits-captions

## Progress Update as of 2026-06-09 4:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Each carousel photo now shows "[caption] — added by <Name>" under the focused photo (name links
to the uploader's profile), positioned above the "N / M" counter (counter moved below the credit
line). Caption can be set at upload time in BOTH the admin uploader and the attendee modal. No
schema/migration (event_photos already has caption + uploadedByEvaluationId).

### Detail of changes made:
- `PhotoCarousel`: `CarouselPhoto` gains `addedByName`/`addedByHref`; renders the caption + "added
  by <name>" credit line (same line) under the photo; moved the position counter to sit below it.
- `getEventPhotos`: left-joins evaluations to return uploaderName/uploaderSlug/uploaderSlugKind.
- Recap slides pass caption + addedByName + addedByHref (hidden on locked photos).
- Admin photo record route now sets `uploadedByEvaluationId` = the admin's claimed eval (so
  admin-added photos credit e.g. DROdio).
- `EventPhotoManager` (admin) + `AttendeePhotoUpload` (attendee) both gained a caption input on
  upload; sent through to the record routes (which already accept caption).

### Potential concerns to address:
- Admins without a claimed profile → no "added by" credit (null), which is fine.
- One caption applies to the whole batch in each uploader; per-photo caption editing still exists
  in the admin grid.

# event-photo-attendees-ui

## Progress Update as of 2026-06-12 11:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Event photo carousel: caption author citation changed from "— added by <name>"
to ". -<name>" (italic, name still links); caption moved closer to the photo
(tighter container + gap); the "+ Add Your Photos" pill now sits on the same line
as the "1/27" counter as a small matching pill. Also fixed the attendees table so
the viewer's "You" row columns line up with the Connect rows.

### Detail of changes made:
- `src/components/events/PhotoCarousel.tsx`: `addedByNode` → `<span italic>-<name></span>`
  (kept the @mention caption rendering untouched); separator "— added by" → ". ";
  same change in the lightbox caption. Reduced container height
  (18/26/31rem → 14/20/24rem) + `gap-3`→`gap-1` so the caption hugs the photo. New
  `actionSlot?: ReactNode` prop rendered in the counter row.
- `src/components/events/AttendeePhotoUpload.tsx`: trigger restyled to a small
  `text-xs px-2 py-0.5` pill matching the counter height.
- `src/app/(authed)/events/[slug]/page.tsx`: pass `<AttendeePhotoUpload>` as the
  carousel's `actionSlot` (counter + add pill on one line); still rendered
  standalone when there are no photos.
- `src/components/events/ProfileMiniTable.tsx`: action column fixed width
  (`_6rem`/`sm:_7rem`) instead of `auto`, so a short "You" cell no longer expands
  the name column and shifts the score columns out of alignment.

### Potential concerns to address:
- Carousel container heights + caption gap were tuned without a live preview;
  easy to nudge if the caption is still too far/close.
- A rare wide action ("Wants to connect") may wrap on mobile in the fixed 6rem
  column; acceptable.

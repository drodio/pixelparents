# Caption on the expanded (lightbox) photo

## Progress Update as of 2026-06-09 1:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The maximized photo now shows its caption + "added by" credit overlaid on the bottom
of the image, over a dark gradient + light backdrop blur for legibility.

### Detail of changes made:
- `PhotoCarousel.tsx`: extracted `captionNodes()` (caption → mention-aware nodes, "@" stripped)
  and `addedByNode()` helpers; the under-carousel line now reuses them (DRY).
- Lightbox image wrapped in a `relative inline-block`; a bottom overlay
  (`bg-gradient-to-t from-black/85 … backdrop-blur-[2px]`) shows `captionNodes` +
  "— added by <name>". Only rendered when there's a caption or uploader.
- Added `scripts/check-uploaders.cjs` (read-only) to audit how many event_photos rows have
  `uploaded_by_evaluation_id` + a joined name, for diagnosing the "added by" credit.

### Potential concerns to address:
- Overlay sits over the bottom of the image (object-contain), so on very short/wide images it
  covers more of the picture; gradient keeps the image visible behind it.

# PRD — photo-3tier-lock

## Progress Update as of 2026-06-07 10:24 AM Pacific
*(Most recent updates at top)*

### Summary
3-tier event photo visibility (public / claimed / attendees) with a blurred-lock
teaser. Photos the viewer can't access are no longer hidden — they show blurred
(CSS) with a lock icon + tier label ("Claim your profile to view" / "For
attendees only").

### Detail
- `event-recap.ts`: PhotoVisibility adds "claimed"; new `canViewPhoto(visibility,
  {isClaimed,isAttendee})` (public→all, claimed→claimed-or-attendee,
  attendees→attendee) + `photoLockLabel`. Legacy `visiblePhotos` kept.
- `events/[slug]/page.tsx`: recap slides now include ALL photos, each annotated
  `locked`/`lockLabel` via canViewPhoto (isClaimed = has evaluationId).
- `PhotoCarousel.tsx`: CarouselPhoto gains locked/lockLabel; locked slides render
  blurred (blur-xl + scale to hide edges) + dark overlay + LockIcon; the center
  shows the tier label. (CSS blur only — source URL still in the DOM, per the
  agreed tradeoff.)
- Admin `EventPhotoManager` + both photo API routes: add the "claimed" option/value.

### Verification
- event-recap test 11/11 (added canViewPhoto cases); `next build` green.

### Note
- visibility is a text column → no migration. CSS blur exposes the URL (accepted
  "for now"); a server-side blurred thumbnail is the private-safe upgrade.

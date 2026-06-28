# PRD — photo-carousel-peek

## Progress Update as of 2026-06-06 11:12 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. (1) Event DETAIL pages (`/events/[slug]`) now show the full shared
top nav (logo + SiteHeaderNav + search), matching /profile and /leaderboard
(previously just a centered logo). (2) The recap photo carousel now shows the
previous/next photos peeking out behind the centered one (Time-Machine /
cover-flow style); the full thumbnail strip stays below.

### Detail of changes made:
- `src/app/events/[slug]/page.tsx`: fetch `getCurrentViewerContext()`; replaced
  the centered logo with a `<header>` of logo + `<SiteHeaderNav currentPage="events" …>`.
- `src/components/events/PhotoCarousel.tsx`: stage is now a peek layout — center
  photo (z-10, shadow) flanked by prev/next photos (absolute, ~40% wide, partly
  off-screen, dimmed, clickable) on sm+. Arrows + counter overlay the center;
  thumbnail strip unchanged. Mobile shows just the center.

### Verification done:
- `next build` compiles + typechecks.

### Still pending (separate, needs design):
- 3-tier photo visibility (public / claimed / attendee) + blurred-lock teaser
  ("Claim profile to view photo"). Privacy note: attendee photos are in PUBLIC
  Blob, so CSS-blurring exposes the URL — needs a server-side blurred thumbnail
  or a placeholder, not a raw blur.

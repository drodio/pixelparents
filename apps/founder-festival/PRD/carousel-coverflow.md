# PRD — carousel-coverflow

## Progress Update as of 2026-06-06 11:23 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Rebuilt the recap photo carousel as a proper cover-flow (the prior peek version
made the side photos BIGGER than the center). Now: center photo is largest; up
to ±2 neighbors fan out behind it, each scaled 0.8^|offset| (80%, then 64%) and
progressively faded; the carousel breaks out wider than the text column.

### Detail of changes made:
- `src/components/events/PhotoCarousel.tsx`: rewritten. Full-bleed wrapper
  (`left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden` → inner max-w-5xl) so
  photos exceed the column width. Stage renders offsets [-maxOffset..maxOffset]
  (maxOffset = min(2, floor((n-1)/2)) to avoid duplicate wraps on small galleries);
  each slide is absolutely centered with
  `transform: translate(-50%,-50%) translateX(d*72%) scale(0.8^|d|)`,
  z-index 30/20/10, opacity 1/0.6/0.32. Slides are aspect-[3/2] object-cover,
  w-[64%] mobile / w-[46%] sm+. Arrows + counter overlay (z-40); thumbnail strip
  unchanged below. Clicking a side photo navigates to it.

### Verification done:
- `next build` compiles + typechecks.

### Potential concerns to address:
- Slides are aspect-[3/2] cover-cropped (uniform cover-flow); a very wide hero is
  cropped. Switch the center to object-contain if full-image is preferred.
- Full-bleed uses w-screen; `overflow-hidden` on the wrapper prevents horizontal
  scroll from the fanned/peeking neighbors.

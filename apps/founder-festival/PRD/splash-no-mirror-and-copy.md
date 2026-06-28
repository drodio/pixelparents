# Branch: `splash-no-mirror-and-copy` — progress log

Branched from `main` (post PR #50).

## Progress Update as of 2026-05-26 12:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two small splash polish items from QA on `festival.so`:

1. The hero image (`/images/founder-festival-outside.png`) has a
   water-reflection of the tent baked into the bottom ~30% of the
   PNG. With `object-cover` (default `object-position: center`), the
   reflection was bleeding into the visible area depending on
   viewport size. Switched to `object-cover object-top` so the
   container always crops from the bottom — the reflection is now
   below the visible frame at every viewport size.
2. "Scoring you now for membership" → "Deploying agents to score
   you for membership" on the eval-in-progress screen, to better
   reflect what's actually happening (parallel handle resolution,
   enrichment, Claude scoring).

### Files touched:
- `src/components/SplashHome.tsx` — added `object-top` to the hero img.
- `src/components/SplashForm.tsx` — copy tweak on the progress label.

### Note on the asset:
The source PNG itself still contains the reflection. A future
optimization is to re-export the PNG cropped to ~1695×650 to save
~30% of its byte size. Not blocking — `object-top` handles it.

### Potential concerns:
- None.

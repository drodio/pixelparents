# Larger host logos

## Progress Update as of 2026-06-12 9:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made host logos bigger: the "Hosted by" logo on the event page is now ~200px wide, and the
host page (/hosts/<slug>) photo is 80% of the content column.

### Detail of changes made:
- `events/[slug]/page.tsx` "Hosted by": host icon `h-12 w-12 object-cover` → `w-[200px] h-auto
  object-contain shrink-0`, row `items-center` → `items-start` (top-aligns the bigger logo
  next to the blurb). object-contain so non-square logos aren't cropped.
- `hosts/[slug]/page.tsx`: header photo `h-40/48 w-40/48 object-cover` → `w-4/5 h-auto
  object-contain` (80% of the max-w-2xl column).

### Potential concerns to address:
- object-contain means tall/wide logos keep their aspect (no crop); a very tall logo could be
  taller than before. Fine for the square logos in use.

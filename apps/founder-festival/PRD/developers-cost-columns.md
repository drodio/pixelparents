# Branch: `developers-cost-columns` — progress log

## Progress Update as of 2026-06-03 02:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
On `/developers`, replaced the single "Average profile scoring cost" number with a
**two-column "Cost per profile:"** layout — left column `FREE / Existing profiles`,
right column `$X.XX / New profiles`. Columns are flex-centered with a fixed 50px
gap so FREE and the dollar amount sit close together. Removed the trailing
"Existing profiles can be queried for free." line (now redundant with the column
label).

### Detail of changes made:
- `src/app/(authed)/developers/page.tsx` cost block: heading "Average profile
  scoring cost:" → "Cost per profile:"; single `<p>` replaced with
  `flex justify-center gap-[50px]` of two centered cells. Dollar value still
  comes from `applyMarkup(getEstimateCents("sonnet"))` (rolling-median measured
  cost × 10× markup) — no pricing logic change.

### Potential concerns to address:
- None. Copy/layout-only change; no API or pricing change.

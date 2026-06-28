## Progress Update as of 2026-06-05 07:37 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Hotfix to the badge-filter work (#186): the leaderboard overflowed horizontally on badge-heavy rows (visible on `?sort=investor` on prod — ~197px). Root cause was a regression in my `Badges.tsx` "fit" rewrite — the single-line measurement layer lacked `overflow-hidden`. One-class fix.

### Detail of changes made:
- `src/components/Badges.tsx`: the invisible "fit" measurement layer is `flex flex-nowrap whitespace-nowrap` (lays all pills + the "+N more" sentinel on one line to measure widths). It's only `visibility:hidden`, so on rows with many badges its pills extended past the viewport and expanded the document's horizontal scroll. Added `overflow-hidden` to that layer. Clipping does not affect the `offsetLeft`/`offsetWidth` reads the measurement relies on, so the fill calculation is unchanged.
- Why prod-only: dev's data has few badges per row, so the measurement line never exceeded the column width. Reproduced on dev by narrowing the viewport to 720px (150px overflow → 0 after the fix).

### Verification:
- `tsc --noEmit` clean.
- Headless Chrome on dev: 0px horizontal overflow at 1280 / 720 / investor-sort (was 150px @720 before the fix); badge fill still correct (9 "+N more" rows, all show ≥1 badge); click-to-filter still works (43→26). Will confirm 0 overflow on prod `?sort=investor` after deploy.

### Potential concerns to address:
- None specific. The measurement remains layout-based (offset reads), unaffected by the clip.

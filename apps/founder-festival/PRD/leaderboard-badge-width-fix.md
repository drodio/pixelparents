## Progress Update as of 2026-06-05 07:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed one founder's row (and any like it) showing only one badge + "+9 more" while peers showed 5–6. The badges "fit" measurement was reading a column whose width depended on its own content, making it bistable — some rows collapsed to their name-line width (~140px) and then only fit one badge. One-class fix: make the name/badges column `flex-1`.

### Detail of changes made:
- `src/components/LeaderboardTable.tsx` (`NameCell`): the name+badges column was `flex flex-col gap-1.5 min-w-0` (no grow), so it sized to content. The badges block is `w-full` of that column, and the "fit" measurement reads the column width — a circular dependency with two stable states. That row settled into the collapsed state (measured `containerW≈140px` vs ~499px for peers), so its budget only fit one badge. Added `flex-1` so the column always fills the available width (table-fixed Name td minus the avatar), independent of badge content.
- Result: every row's measured `containerW` is now identical (544px at 1280 viewport), so the fill is consistent.

### Verification:
- `tsc --noEmit` clean.
- Headless Chrome on dev: `containerW` identical across rows (was 436/459/501 varying; prod Collison had collapsed to 140); 0px overflow at 1280 / 720 / investor-sort; first 12 rows now show 5–6 badges before "+N more" (min 5, was 1). Will confirm Collison specifically on prod after deploy.

### Potential concerns to address:
- None. `flex-1 min-w-0` is the standard "fill available + allow truncation" combo; the name line still truncates correctly.

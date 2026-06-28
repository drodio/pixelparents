## Progress Update as of 2026-06-05 03:32 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made the public `/leaderboard` Founder / Investor / Combined score columns sortable, with a shareable URL. Desktop: click the column header (▲/▼ arrow on the active column, admin-table style). Mobile: a `Sort:` segmented control above the card list (cards have no headers). Direction is encoded in the URL as `?top=highest|lowest`, defaulting to `highest`; the sort column is `?sort=founder|investor|combined`, defaulting to `combined`.

### Detail of changes made:
- `src/lib/leaderboard-constants.ts`: new `LeaderboardDirection = "highest" | "lowest"` type; added `direction` to `LeaderboardFilter`.
- `src/lib/leaderboard.ts`:
  - `parseLeaderboardFilter` reads the `top` param → `direction` (only the literal `"lowest"` flips it; everything else defaults to `highest`).
  - `getLeaderboard` orders `asc`/`desc` on (scoreCol, id) per direction, and the **keyset cursor comparison flips** accordingly: `>`/`(= AND id >)` for ascending, `<`/`(= AND id <)` for descending. The opaque cursor (`{score, id}`) is unchanged — direction lives in the filter, so the next page re-derives the comparison.
  - `searchLeaderboard` applies the same direction to its ordering so searching while sorted stays consistent.
  - Imported `asc` from drizzle-orm alongside the existing `desc`.
- `src/components/LeaderboardClient.tsx`: owns the shared `onSort(column)` handler. New column → `highest`; re-click active column → toggle direction. Writes `sort`/`top` to the URL (drops `top` when `highest` to keep URLs clean; drops `e`/`cursor`/`limit`) and `router.push`es — same navigation pattern as `LeaderboardFilters.apply`, so SSR re-render resets pagination. Renders the mobile `LeaderboardSortControl` (`sm:hidden`) and passes `direction`/`onSort` to `LeaderboardTable`.
- `src/components/LeaderboardTable.tsx`: desktop score `<th>`s are now `SortableTh` buttons (▼ highest / ▲ lowest, arrow only on the active column).
- `src/components/LeaderboardSortControl.tsx` (new): mobile segmented `Sort:` control mirroring the same affordance.
- Tests: `tests/lib/leaderboard-filter.test.ts` updated for the new `direction` field + a `top`-parsing case. `tsc --noEmit` clean; lint clean on changed files; leaderboard lib + api tests pass (35 tests).
- Verified on the local dev server (port 3002): `highest` → DESC (388→330), `lowest` → ASC (15→20…), ascending keyset pagination chains page-to-page with no overlap (page1 ends 20, page2 starts 25), and `/api/leaderboard/search` respects direction.

### Potential concerns to address:
- The `#` column is a positional index of the *current* view, not a stored rank, so with `top=lowest` the `#1` row holds the lowest score. Intentional/accepted (discussed with DROdio).
- Sort is independent of the Role facet: sorting by founder ascending while Role=Both surfaces many 0-founder-score rows first. Expected.
- No DB-backed ordering test was added (the suite's Neon DB tests are known-flaky under parallelism per the repo handoff); ordering/pagination was verified manually against the dev DB instead.

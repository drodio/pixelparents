## Progress Update as of 2026-06-05 03:46 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Bugfix follow-up to the sortable-leaderboard feature (PR #177): clicking a score column updated the arrow + URL but the row list didn't actually re-sort until a hard refresh. Fixed by remounting `LeaderboardClient` on any result-affecting filter change so it re-seeds from the fresh server data.

### Detail of changes made:
- Root cause: `/leaderboard` sort/facet changes navigate client-side via `router.push` (soft navigation). The server component re-renders with new `rows`/`filter` props, but React preserves `LeaderboardClient`'s state across the soft nav. Its `pagedRows` is seeded once from `initialRows` via `useState`, so the displayed (already-paginated) list kept the old ordering until a full page reload remounted the component. The header arrow moved because `SortableTh` reads the updated `sort`/`direction` props directly — which is exactly why it looked like "sorted but not resorted."
- Fix: `src/app/(authed)/leaderboard/page.tsx` now passes a `key={clientKey}` to `<LeaderboardClient>`, where `clientKey` is `JSON.stringify` of every result-affecting filter field (role, sort, direction, stages, outcomes, badges, raisedMin, raisedMax, teamMin). A change to any of them remounts the client, re-seeding `pagedRows`/`nextCursor` from the new SSR data and resetting infinite-scroll to page 1. Excludes limit/cursor (constant for SSR) and the row-highlight `e`.
- This also fixes the same latent staleness for the facet filters (Role/Stage/Outcome/Capital/Team/Badges), which used the identical `router.push` path.
- Trade-off: changing sort or a facet now clears the search box (the client remounts). Acceptable — you're changing what you're looking at. If we want to preserve an in-flight search across sort changes later, switch to an effect-based resync (reset `pagedRows`/`nextCursor` on a filter-signature change + re-run the active search) instead of the key remount.

### Verification:
- `tsc --noEmit` clean. `tests/lib/leaderboard-filter.test.ts` passes (10).
- Browser-verified with Playwright driving system Chrome against the dev server (port 3002): default view is combined-DESC; clicking **Investor** (no refresh) re-sorts the list to investor-DESC and the top row changes (Jordan Lee → Alex Kim); a second click toggles to investor-ASC; URLs update to `?sort=investor` then `?sort=investor&top=lowest`.

### Potential concerns to address:
- Search box clears on sort/facet change (see trade-off above). Revisit only if it becomes annoying.
- The pre-existing `<a href="/?home=1">` + `<img>` in the leaderboard header still trip `@next/next` lint rules (unrelated to this change; present on main). Left as-is.

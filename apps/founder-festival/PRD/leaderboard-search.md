# Branch: `leaderboard-search` — progress log

Branched from `main` (post `worktree-infrastructure` merge, commit `0c0652b`).

## Progress Update as of 2026-05-28 4:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a search box above the Combined/Founders/Investors tab nav on
`/leaderboard`. Filters the currently active tab client-side by
case-insensitive substring against the displayed name, the company name,
and the LinkedIn URL — any field match shows the row.

### Detail of changes made:
- New client component `src/components/LeaderboardClient.tsx` owns the
  search input state, the tab nav, and renders `LeaderboardTable` with
  filtered rows. The tab nav was lifted out of `page.tsx` into this
  client wrapper so the search box can sit above it.
- `src/components/LeaderboardTable.tsx`: exported `displayName` so the
  client wrapper matches against the same string the row visibly shows
  (fullName or the linkedin handle fallback). No behavioral change to
  the table itself.
- `src/app/(authed)/leaderboard/page.tsx`: server component still loads
  the rows with `getLeaderboard(tab)` and now hands everything to
  `<LeaderboardClient>` instead of rendering the tab nav + table inline.
- Tab navigation still uses `<a href>` links — switching tabs is a real
  navigation, so the search query resets when you switch tabs. This is
  intentional (mirrors how `e` and `tab` query params are URL-driven).
- Filtering uses `useMemo` keyed on `rows` + the trimmed lowercased
  query. Empty query short-circuits to the unfiltered list.

### Potential concerns to address:
- The filter is client-side. With the current leaderboard size this is
  fine, but if the list grows past a few thousand rows we'll want
  server-side search (URL-driven `?q=`) and pagination.
- Pre-existing test failures in `tests/app/rescore-all.test.ts` and
  `tests/lib/profiles-scored.test.ts` reproduce on `main` — unrelated to
  this change, but they should get a separate fix.
- Lint findings on `page.tsx:20-21` (home-link `<a>` and logo `<img>`)
  are pre-existing and untouched here. Same lint warnings on
  `NotAuthorized.tsx`, `find-linkedin-handle.ts`, `auto-claim.ts`,
  `leaderboard.ts` (unused `eq`), and `mm-loader.ts` are all pre-existing.

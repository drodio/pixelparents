## Progress Update as of 2026-06-10 12:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Industry badges (turquoise) now also render on leaderboard rows, and clicking one filters the leaderboard by that industry — completing the profile-side work (PR #309) across both surfaces.

### Detail of changes made:
- `src/lib/leaderboard.ts`: `decorateRows` now passes `canonicalIndustries: r.canonicalIndustries` into `computeBadges`, so leaderboard rows carry the same turquoise `industry:<slug>` badges as profiles.
- `src/components/Badges.tsx` (fit layout): industry badges are now clickable even though they aren't in `FILTERABLE_BADGE_IDS` (`clickable?.has(b.id) || b.category === "industry"`).
- `src/components/LeaderboardClient.tsx` `onBadgeFilter`: an `industry:<slug>` id toggles the `industry` CSV facet (via the slug) instead of the `badge` facet — so a row-badge click drives the same industry filter as the sidebar, and shows the existing removable industry pill in `LeaderboardActiveFilters`.

### Potential concerns to address:
- Row badge density increases (achievement + industry badges); the fit layout still collapses overflow to "+N more", so no horizontal blowout.
- Industry badges intentionally don't appear in the sidebar "Badges" count list (they live in the sidebar's separate Industries section) — no double-counting.
- Pre-existing `react-hooks/set-state-in-effect` lint errors in `Badges.tsx` / `LeaderboardClient.tsx` are untouched and non-blocking.

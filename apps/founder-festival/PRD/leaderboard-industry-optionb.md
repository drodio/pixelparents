## Progress Update as of 2026-06-05 11:14 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Flipped industries to "Option B" on the leaderboard: a sidebar **Industries** section with live per-industry counts (click-to-filter), plus industry **pills** in the active-filter row. Consumes the industry data layer the scoring agent shipped (`canonical_industries` column, `industry=<slug>` param + `arrayOverlaps` predicate, `industries.ts` taxonomy) — the predicate/filtering was already live; this adds the counts + UI.

### Detail of changes made:
- `src/lib/leaderboard.ts`: new `getIndustryCounts()` — `SELECT s, COUNT(*) FROM evaluations, unnest(canonical_industries) s WHERE <baseWhere> GROUP BY s` (global, over baseWhere). Returns `{ slug: count }` for slugs with ≥1 profile.
- `src/app/(authed)/leaderboard/page.tsx`: fetch `getIndustryCounts()` in the `Promise.all`, pass `industryCounts` to `LeaderboardClient`, and add `filter.industries` to the remount `clientKey` so industry filter changes reset pagination.
- `src/components/LeaderboardClient.tsx`: thread `industryCounts` to both `LeaderboardFilters` instances (sidebar + drawer); include `filter.industries.length` in the mobile facet-count badge.
- `src/components/LeaderboardFilters.tsx`: new **Industries** `FacetGroup` — every industry with count > 0, most-common first, `Label (count)` via `industryLabel()`, toggling the `industry` CSV facet. (Industry taxonomy `industries.ts` is DB-free, safe for the client bundle.)
- `src/components/LeaderboardActiveFilters.tsx`: industry pills (white, removable) using `industryLabel`, removing from the `industry` CSV.

### Verification:
- `tsc --noEmit`: my files clean (the only errors are pre-existing in `tests/lib/sms.test.ts`, untouched by me).
- Browser verification pending (see next steps after rebase onto the advanced main).

### Potential concerns to address:
- **Rebase needed:** origin/main advanced (status-marker rework + "show all leaderboard badges (no inner scroll)" — `956dc70`). On rebase, align the Industries section with the badges section (the agent removed the `max-h-80` inner scroll), and resolve any `LeaderboardFilters.tsx` / `leaderboard.ts` overlap.
- **Row-badge industry click-to-filter deferred:** the `industry-*` row badges are free-text-derived; mapping them to a canonical slug for click-to-filter needs `canonicalizeIndustries`. The sidebar checkboxes + pills give full Option B filtering; row-badge industry clicks can come later.
- `getIndustryCounts()` runs per SSR (one unnest+group-by); cache with the other counts if prod latency grows.

### Update (rebased onto advanced main)
- Aligned the Industries sidebar section with Badges (removed inner-scroll `max-h-80`) — the scoring agent had just shipped "show all leaderboard badges (no inner scroll)".
- Rebased cleanly onto origin/main (status-marker rework + badges no-scroll). `tsc` clean for my files (only pre-existing `tests/lib/sms.test.ts` errors remain). Dev DB has no `canonical_industries` data so the section is empty on dev (graceful) — verifying on prod where it's backfilled.

## Progress Update as of 2026-06-05 07:22 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made every leaderboard badge a clickable filter, restructured the sidebar (no "Filters" heading / no "Clear all" / no "Outcome" facet; the Badges section now lists the full taxonomy with live counts, most-common first), added a white removable active-filter **pills row** under the search box, fixed the badge "fit" row so it fills with badges then shows "+N more" (was collapsing to just "+9 more"), and tokenized search so "sam odio" matches "Samuel … Odio". Built on the `worktree-scoring-rubric` (#178) base. Industry remains the other agent's lane (see `docs/coordination/leaderboard.md`).

### Detail of changes made:
- **Predicates** (`src/lib/leaderboard-badge-sql.ts`): extended `BADGE_SQL_PREDICATES` to the full taxonomy — `claimed` (correlated `EXISTS` over `users` w/ match_confidence high|medium), `first-founder` (=1), `leads-rounds`, `on-neo`, the 6 investor `*-focus` stage badges (POSIX `~*` over `jsonb_array_elements_text(investor_stage_focus)`, regexes ported from `STAGE_BADGE_MAP`; `seed` excludes `pre-seed` to mirror first-match-wins), and `mm` (Top web ≤100k via `mmHits` jsonb matched to `primaryCompanyDomain`, incl. subdomains).
- **Counts** (`src/lib/leaderboard.ts`): new `getBadgeCounts()` — one `count(*) filter (where <predicate>)` per badge over `baseWhere`; global (not re-scoped to the active filter). Called in the page's `Promise.all`.
- **Search** (`src/lib/leaderboard.ts`): `searchLeaderboard` now tokenizes the query (`tokenizeSearchQuery`, exported) — each whitespace token must match (AND) across the OR of name/linkedin/company fields. Fixes partial multi-word search.
- **Constants** (`src/lib/leaderboard-constants.ts`): `BADGE_FILTER_LABELS` (label per badge id), `badgeFilterLabel()`, and client-safe `FILTERABLE_BADGE_IDS` (= label keys) so the client never imports the server predicate module. A test asserts client ↔ server id parity.
- **Badges fit** (`src/components/Badges.tsx`): rewrote the measurement — a nowrap measure layer + a "+N more" sentinel; show as many pills as fit within `containerWidth − sentinel`, always ≥1 when overflowing (fixes the 0-visible "+9 more" row). Added `onBadgeClick` + `filterableBadgeIds`; filterable pills render as buttons (`PillReadOnly` gained an optional `onClick`).
- **Sidebar** (`src/components/LeaderboardFilters.tsx`): removed the "Filters" `<h2>`, the "Clear all" link, and the "Outcome" facet (now covered by badges). Badges section renders `badgeCounts` (count > 0) sorted desc as `Label (count)`. New `badgeCounts` prop; dropped `hideHeading`.
- **Pills** (`src/components/LeaderboardActiveFilters.tsx`, new): white removable pills under the search ("Filters: …"); enumerates role/stage/capital/team/badge (+ legacy outcome); hidden when none. Removal navigates with just that value stripped.
- **Client** (`src/components/LeaderboardClient.tsx`): single `navigate(mutate)` primitive (onSort refactored onto it), `onBadgeFilter` (toggle badge CSV), renders the pills row, passes `badgeCounts` to both sidebar + drawer, and `onBadgeFilter` + `FILTERABLE_BADGE_IDS` to the table. `LeaderboardTable`/`NameCell` thread these into both `Badges` instances (claimed + others), desktop + mobile.
- **Coordination**: `docs/coordination/leaderboard.md` documents the ownership split (this agent = leaderboard UI/filter machinery; other agent = industry data layer + HN + scoring) and the industry interface contract.

### Verification:
- `tsc --noEmit` clean; 49 leaderboard/badge tests pass (incl. new taxonomy parse, client↔server id parity, tokenizeSearchQuery).
- Headless Chrome (Playwright) on the dev server: no horizontal overflow (default + investor sort); 9 rows have "+N more" and **all** show ≥1 badge; sidebar has no Filters/Clear-all/Outcome and shows counts sorted desc; clicking "YC" sets `?badge=yc`, shows the white pills row, restricts 43→26; removing the pill clears it; "dan odio" finds Odio. Screenshot reviewed.

### Potential concerns to address:
- `getBadgeCounts()` runs on every leaderboard SSR (≈24 conditional aggregates incl. a correlated claimed-EXISTS + jsonb scans). ~0.6s warm on dev; fine, but it's global/identical per request — cache it (Runtime Cache / unstable_cache) if prod latency grows.
- Stage-focus / leads-rounds / on-neo returned 0 on the **dev** DB (no investor-enrichment data there). SQL is valid and executed cleanly; verify counts/filters look sane on prod after deploy.
- Industry badges are intentionally non-clickable + absent from the sidebar until the industry agent ships `industry=<slug>` + a normalized column (see coordination doc) — then they upgrade to Option B with no UI rework.
- Two pre-existing `react-hooks/set-state-in-effect` lint errors in `Badges.tsx` (lines for `setLocal`/`setVisibleCount`) predate this branch; Vercel build doesn't gate on eslint. Left as-is.

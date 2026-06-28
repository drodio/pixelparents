## Progress Update as of 2026-06-05 09:29 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added founder + investor status markers next to the Founder/Investor numbers on the leaderboard (desktop + mobile), reusing the scoring agent's shared `StatusMarker`, and darkened the "never" red. Reconciled with the scoring agent, who shipped the real LLM `investor_status` column + the generic `StatusMarker` + the rescore hotfix in parallel — so this branch drops the interim heuristic I had drafted and reads the real columns.

### Detail of changes made:
- `src/components/FounderStatusMarker.tsx`: darkened the `never` marker `text-red-500` → `text-red-700` (shared by profile + leaderboard). This is the "make the red asterisk darker" request.
- `src/lib/leaderboard.ts`: `LeaderboardRow` + `RawRow` gain `founderStatus` / `investorStatus` (`ScoreStatus | null`, exported `ScoreStatus` type); both selects (`getLeaderboard`, `searchLeaderboard`) select `evaluations.founderStatus` / `evaluations.investorStatus`; `decorateRows` passes them through. No heuristic — these are the LLM-classified columns the scoring agent owns.
- `src/components/LeaderboardTable.tsx`: import the shared `StatusMarker` and render `<StatusMarker role="founder" status={row.founderStatus} />` in the Founder cell + `role="investor"` in the Investor cell (desktop), and in the founder/investor entries of the mobile 3-up score grid. Widened Founder/Investor columns `w-20` → `w-24` so number + marker fit without reintroducing the horizontal-overflow bug.
- Test fixtures (`api-leaderboard-page`, `api-leaderboard-search`, `leaderboard-payload`) updated with the two new required fields.
- `docs/coordination/leaderboard.md`: documented the status-marker split (scoring agent owns the LLM columns + `StatusMarker`; leaderboard renders them) and the darker-red change.

### Reconciliation note (important):
The scoring agent merged `ab9899f` (per-role status markers + real `investor_status` column) and `2954a54` (#196 hotfix tolerating missing founder/investor status on rescore) while this was in flight. That #196 hotfix is the fix for the earlier **Patrick Collison rescore failure** (the pipeline had started requiring the new status fields). My originally-drafted interim investor heuristic + a duplicate marker component were dropped in favor of their LLM column + shared `StatusMarker` to avoid drift.

### Verification:
- `tsc --noEmit` clean.
- Headless Chrome on dev: founder + investor markers render on all sampled rows with real LLM tooltips ("Current founder" / "Current investor" / etc.); darker-red "never" shows (e.g. a "0 ✱" investor); **0px horizontal overflow** at default and `?sort=investor` (the right-popping tooltip + column widen did not regress overflow); 172 markers render on mobile cards with no overflow. Screenshot reviewed.

### Potential concerns to address:
- The status markers depend on `founder_status` / `investor_status` being populated; rows where a status is null render no marker for that dimension (expected).
- `getBadgeCounts()` (separate feature) still runs per SSR — cache later if prod latency grows.

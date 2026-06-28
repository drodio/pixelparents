# Branch: `leaderboard-filtering-and-scoring` — progress log

## Progress Update as of 2026-05-31 8:13 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Split the design spec into three TDD implementation plans under `docs/superpowers/plans/`, then executed all three. **Plan 1 (scoring)** — Task 1 shipped to prod (PR #140); Tasks 2–5 committed but NOT shipped (behavior-changing, pending a rescore). **Plan 2 (filtering UI)** — complete (Tasks 1–9). **Plan 3 (`/api/v1/leaderboard`)** — complete (Tasks 1–4). Work lives in a dedicated git worktree at `.claude/worktrees/leaderboard-scoring`. User decisions: ship as 3 PRs, include team-size facet in V1, build the backfill path but do NOT run the rescore.

### Plan 3 progress
- **Tasks 1–4 (done):** `src/lib/leaderboard-cursor.ts` opaque base64url keyset cursor (`{score,id}` → token), wired into `parseLeaderboardFilter` via `decodeCursor`. `src/lib/api/leaderboard-payload.ts` curated row serializer (`LeaderboardApiRow`, snake_case, badge ids only, never the raw profile) + `next_cursor` (emitted only on a full page, keyed by sort). `src/app/api/v1/leaderboard/route.ts` GET handler: verifyApiKey → per-key rate limit (`leaderboard:<keyId>`, default 2000/day) → parseLeaderboardFilter → getLeaderboard → buildLeaderboardPayload. Docs at `docs/api/v1-leaderboard.md`. 10 new tests (cursor, payload, route 401/429/200); tsc + eslint clean. Route test follows the repo's `vi.mock` + direct-handler-import convention.

### Plan 2 progress
- **Tasks 1–4 (done):** `LeaderboardFilter` type + `STAGE_VALUES`/`OUTCOME_VALUES`/`LeaderboardRole`/`LeaderboardCursor` (`src/lib/leaderboard.ts`); `parseLeaderboardFilter(URLSearchParams)` shared parser (lenient, drops invalid members, clamps limit 1..100, default sort from role); `buildLeaderboardWhere(filter)` compiling facets to a Drizzle `SQL` (OR within facet, AND across — stage `IN`, outcome booleans, raised gte/lte, team_min int, badge predicates); `src/lib/leaderboard-badge-sql.ts` mirroring `computeBadges()` predicates for 13 metrics-derived badges (`claimed`/`mm` deferred — need users join / mmHits array). 16 new pure-function tests pass; tsc clean.
- **Tasks 5–9 (done):** `getLeaderboard(tab)` → `getLeaderboard(filter)` — role gate (founder/investor require positive score), facet WHERE, keyset cursor WHERE on `(orderCol, id)`, tiebreaker switched from `createdAt` → `id`, limit from filter. Page reads facet params into the filter (limit 500). New `LeaderboardFilters.tsx` sidebar (Role segmented control, Stage/Outcome/Badge checkboxes, Capital-raised + Team-size threshold selects, Clear-all) driven by `useRouter`/`useSearchParams` URL navigation. `LeaderboardClient` → 2-col layout + mobile filter drawer; tabs removed (Role facet replaces them). Migration `drizzle/0027_married_preak.sql` adds `evaluations_company_stage_idx` (btree). tsc + eslint clean on all new files.
- **Plan 2 caveats:** (1) Capital-raised/Team-size use accessible threshold **selects**, not the spec's range slider — same filtering power, URL-shareable, verifiable without a browser; true slider is a polish follow-up. (2) UI not browser-verified locally (no DB connection in this env) — needs a Vercel preview or working env to eyeball rendering/navigation. (3) Migration `0027` NOT applied (`db:push` is an operator action). (4) Plan 2 is shippable independently of Plan 1 (works on existing data); ship as its own PR after preview verification.

### Detail of changes made:
- **Plans:** `2026-05-30-scoring-exit-weighting.md`, `2026-05-30-leaderboard-filtering.md`, `2026-05-30-leaderboard-api.md`. Each TDD, bite-sized, self-reviewed against the spec.
- **Plan 1 / Task 1 (done):** added `ipoMarketCapUsd` + `acquisitionPriceUsd` to `EXTRACTED_METRICS_SCHEMA` (`src/lib/scoring.ts`), both `z.number().int().min(0).nullable().default(null)` so legacy `profile` blobs still parse. Updated full-literal test helpers. 58 scoring tests pass.
- **Workspace:** running in worktree `.claude/worktrees/leaderboard-scoring`. Sibling worktrees use real `node_modules` (ran `npm install`). Run the suite with `npx vitest run tests/lib/...`; DB-connecting suites can't run locally (`.env.local` DATABASE_URL points at prod host) and `tsc` reports `LayoutProps` errors until a first `next build` generates `.next/types`.

### Potential concerns to address:
- **Scores become very large & exit-dominated** under linear/uncapped exit scoring (a $10B IPO ≈ +10,000 pts). Intended for diligence ordering; a normalized/percentile *display* score is a likely follow-up.
- **Backfill not run:** exit values are `null` on all historical rows until an operator triggers `POST /api/admin/rescore-all`. New/edited profiles populate them going forward.
- **Badge filtering** uses SQL predicates (spec default); `claimed`/`mm` badges (need users join / mmHits array) deferred from the V1 badge facet.

## Progress Update as of 2026-05-28 3:14 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Brainstormed (via the superpowers visual companion) a design for leaderboard filtering + a founder-score outcome-weighting fix, prompted by an investor's feedback. Wrote the design spec to `docs/superpowers/specs/2026-05-28-leaderboard-filtering-and-scoring-design.md`. No code yet — design pending user review, then an implementation plan.

### Detail of changes made:
- **Filtering UI:** chosen pattern is a faceted **sidebar** (layout B of 3 mockups). The current top tabs (Combined/Founder/Investor) fold into a **Role** facet.
- **V1 facets (data exists today):** Stage (`company_stage`), Outcome/Traction (`hadIpo`/`hadAcquisition`/`isUnicornFounder`), Capital raised (range slider, **$50K→$1B+**), Badges (renamed from "Pedigree"; from `computeBadges()`), Role.
- **Fast-follow facets (need new extraction):** Industry, Geography (company HQ), Founded year. Team size is available now (optional V1).
- **API:** filters become a shared `LeaderboardFilter` spec + `parseLeaderboardFilter()` consumed by both the UI and a new `GET /api/v1/leaderboard` (key-authed, snake_case params, consistent with the existing `/api/v1/score` API). Semantics: OR within a facet, AND across facets. Excludes the raw `profile` blob in responses.
- **Scoring fix:** new `founder_exit` rule scores exits at **+1 per $1M of exit value, uncapped** (same scale as `venture_raised`), replacing the flat +10-per-exit and S-1 +10 bonus. IPO value = **market cap at IPO** (user chose this over IPO proceeds). Sub-$1M exits/raises floor to 1 point. Fundraising stays linear/uncapped for now (no log-scale/cap). Needs new extracted fields `ipoMarketCapUsd` / `acquisitionPriceUsd` + a backfill rescore.
- Brainstorm mockups persist in `.superpowers/brainstorm/` (gitignored candidate — see concern).

### Potential concerns to address:
- **Scores become very large & exit-dominated** under linear/uncapped exit scoring (a $10B IPO ≈ +10,000 pts). Intended for diligence ordering, but raw numbers may look odd; a normalized/percentile *display* score is a likely follow-up.
- **Backfill cost:** re-scoring all rows to populate exit values spends LLM/Exa budget — run as a controlled batch, not inline.
- **Badge filtering** approach (reproduce predicate in SQL vs. persist a `badge_ids[]` column) deferred to implementation; default to the SQL predicate.
- `.superpowers/` is not in `.gitignore` yet — add it so brainstorm artifacts aren't committed.
- "Why ranked here" inline breakdown (the legibility half of the investor's complaint) is recommended but deferred from V1.

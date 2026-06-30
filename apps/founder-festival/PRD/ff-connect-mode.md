## Progress Update as of June 30, 2026 — 12:20 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Implemented a flag-gated **Connect mode** that de-scores the app into
a rich INFO aggregator for a Stanford OHS parent↔student/alumni/community
connector. When `CONNECT_MODE` is ON the eval pipeline SKIPS the numeric Claude
scoring cascade and runs a lightweight, cheaper Claude **info-extraction** pass
instead (identity + neutral bio + expertise tags + "how they can help"), persists
all score fields as 0/null, and the profile + leaderboard UIs hide every score /
rank / founder-investor framing — rendering an info profile and a searchable
**Directory** instead. Default OFF; when OFF everything behaves exactly as today
(festival.so unaffected). This branch is STACKED on `feat/ff-enricher-visibility`
(PR #104) and rebases onto `main` once that merges.

### Detail of changes made:
- **Config flag** — new `src/lib/config/connect-mode.ts`: `isConnectMode()`
  (server, reads `CONNECT_MODE` at call time) + `CONNECT_MODE_CLIENT` constant
  (client, reads `NEXT_PUBLIC_CONNECT_MODE`). Uses the project's existing
  boolean-env convention (`on`/`1`/`true`, trimmed/lowercased). Default OFF.
- **Pipeline** — new `src/lib/connect-info.ts`: `extractInfoProfile()` runs ONE
  cheap Claude pass (Haiku, via the existing `generateText` + `MODEL_GATEWAY_ID`
  AI-Gateway plumbing) over the already-rendered grounded-facts + ok-enrichment
  block, and `infoToScoringResult()` maps the small "info profile" onto a full
  `ScoringResult` with EVERY score field zeroed. Mapping: bio → `credibilityTitle`,
  expertise tags → `industries` (canonicalized + rendered as plain tags, no
  points), "how they can help" → `recommendations.items` (reframed as the
  person's OFFER, not advice to them), identity → `SCORING_SCHEMA.identity`.
  The module is DB-free (only type imports) so it's unit-testable.
  - `eval-pipeline.ts` `scoreInputs()`: when `isConnectMode()`, branch BEFORE
    `scoreWithClaude` to `extractInfoProfile` and return a normal `ScoredPayload`
    (`escalate:false`). Because scores are 0 and the payload shape is unchanged,
    the existing `payloadToWriteFields` persists score=0 / empty breakdowns /
    null statuses while keeping `profile.identity`, `recommendations`,
    `canonicalIndustries`, `enrichments[]`, and `profile.enrichmentStatuses`
    (PR1) intact — no persistence changes needed.
  - `fillMissingFounderInvestorStatus()` short-circuits in connect mode so the
    status classifier doesn't re-introduce founder/investor markers.
- **Profile UI** (`src/app/(authed)/profile/page.tsx` + new
  `src/components/ConnectExpertiseSection.tsx`): in connect mode, hide the whole
  score block (founder/investor/combined numbers, percentiles, "#N on
  Leaderboard", dossier), the credibility radar, the FounderMatrix, and the
  ScoreTable. Render instead an "Areas of expertise / how they can help" section
  (from the reframed recommendations) plus the kept identity header, bio
  (`EditCredibilityTitle`), Industries/expertise tags (`Badges`), the
  `EnrichmentSourcesSection` data-sources roster (PR1), facts, and links.
- **Leaderboard → Directory** (`src/app/(authed)/leaderboard/page.tsx`,
  `LeaderboardClient.tsx`, `LeaderboardTable.tsx`, `leaderboard.ts`): new
  `getDirectory()` (name-ascending, no role gate, no score order, single SSR
  page — no score-keyset cursor) + `getDirectoryCount()` (head count; the
  founder/investor split reads 0/0 when all scores are 0). The page title
  becomes **"Directory"**, the subtitle becomes "N people in the community", and
  `LeaderboardClient`/`LeaderboardTable` take a `connectMode` prop that drops the
  rank (#) column, the Founder/Investor/Combined columns, the sortable headers,
  the mobile sort control, and infinite-scroll — KEEPING the industry/expertise
  facet filters + search. `SiteHeaderNav` renames the nav tab to "Directory".
- **Trigger logic**: no new wiring needed. Connect mode gates inside
  `scoreInputs`, so the EXISTING enrichment triggers — profile claim and
  LinkedIn/website add-or-update (both call `reEvaluate`), fresh `runEval`, and
  the manual `ReScoreButton` "refresh" — all automatically produce info profiles
  instead of scores when the flag is ON.
- **Tests**: `tests/lib/connect-mode.test.ts` (flag parsing, default-off,
  read-at-call-time) and `tests/lib/connect-info.test.ts` (`infoToScoringResult`
  zeroes all scores, carries identity/tags/bio/help, tolerant of garbage;
  `extractFirstJsonObject` fences/braces). 16 new tests, all pass.

### Validation
- `npx tsc --noEmit` — clean.
- `pnpm test` (vitest) — 929 passed, 5 failed. All 5 failures are PRE-EXISTING on
  the base branch (4 `hn-tokenmaxxing` external-API flakes + 1 `email-variables`
  nickname test — verified by stashing and re-running). The "92 failed test
  files" are the documented whole-file no-`DATABASE_URL` failures (same on main).
- `eslint` on changed files — 3 errors + 2 warnings, ALL pre-existing (the logo
  `<a>`/`<img>` and the `loadNextPage()` effect, present on the base branch). No
  NEW lint errors. New files lint clean.
- `pnpm build` not attempted (cannot pass without a DB, per repo rules).

### Potential concerns to address:
- **Out of scope (deferred to later PRs, intentionally):** the student
  "asks"/matching system; the public `/api/v1/*` responses (left untouched for
  API stability — `getLeaderboard`/`getLeaderboardCounts` and the leaderboard
  page/search APIs still behave as before; connect mode only changes the authed
  `/leaderboard` and `/profile` pages); no scoring code was removed.
- **recommendations.category enum reuse:** connect mode's "how they can help"
  categories (expertise/mentorship/intros/industry/community) are mapped onto the
  existing founder-centric enum (intros/positioning/wellbeing/tactical) so we
  didn't widen the persisted schema. If a dedicated connect-mode category set is
  wanted later, widen `SCORING_SCHEMA.recommendations.items.category` + migrate.
- **Directory pagination:** the Directory SSRs up to 1000 people in one shot (no
  infinite scroll). Fine for OHS-community scale; if a deployment grows past that,
  add name-keyset pagination to `getDirectory` + a `/api/leaderboard/page`
  connect-mode branch.
- **Mixed-mode data:** flipping the flag does NOT rescore existing rows. A DB
  scored under one mode keeps its stored score/info until re-evaluated; the UI
  gates on the CURRENT flag regardless, so a score-mode row viewed in connect
  mode simply hides its (still-present) scores. Acceptable; a bulk re-eval is the
  way to fully convert a dataset.

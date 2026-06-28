## Progress Update as of 2026-06-05 03:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Three Festival Leaderboard improvements: (1) badges no longer push the
Founder/Investor/Combined columns off-page — the desktop table is now
`table-fixed` so the Name column is bounded, which also makes the existing
Badges "fit" expander actually trigger (relabeled `+N` → `+N more`); (2) a
subtitle "[n] Founder and [n] Investor Profiles" under the title; (3) filter
clicks now update the list live instead of needing a page refresh.

### Detail of changes made:
- `src/components/LeaderboardTable.tsx`: desktop `<table>` → `table-fixed`. In
  auto layout a long badge row stretched the unbounded Name cell and shoved the
  score columns past the right edge (breaking the symmetric page padding); a
  bounded Name cell fixes the overflow AND gives the Badges ResizeObserver a real
  width to measure wrap against, so overflow collapses into `+N more`.
- `src/components/Badges.tsx`: fit-mode expander label `+{n}` → `+{n} more`
  (per request). Click still expands to as many wrapped rows as needed (+ "less").
- `src/lib/leaderboard.ts`: new `getLeaderboardCounts()` — one-pass conditional
  aggregate returning { founders: count(founder_score>0), investors:
  count(investor_score>0) } under `baseWhere` (mirrors the role-gate semantics;
  a both-scorer counts in each).
- `src/app/(authed)/leaderboard/page.tsx`: fetch counts in the Promise.all;
  render the subtitle between the title and the unclaimed-profiles line. Added
  `key={JSON.stringify(filter)}` to `LeaderboardClient`.
- Filter auto-update root cause: `LeaderboardClient` seeded `pagedRows`/
  `nextCursor` via `useState(initialRows)`, which ignores prop changes on a soft
  navigation — so `router.push` from the filters updated the URL but the list
  stayed stale until a hard refresh. The `key` remounts the client on filter
  change, re-seeding state from the fresh SSR rows.
- Verified: tsc clean, `pnpm build` green, 55 leaderboard/badge tests pass, and
  headless-Chrome screenshots of `/leaderboard` and `/leaderboard?role=investor`
  confirm the columns stay on-page, `+N more` appears (e.g. `+5 more`/`+8 more`),
  and the subtitle renders "42 Founder and 30 Investor Profiles" (dev DB).

### Potential concerns to address:
- The `key={JSON.stringify(filter)}` remount also resets the client search box and
  scroll on a filter change — acceptable/expected, but noting it. A non-remount
  alternative (syncing state via effect) exists if we later want to preserve search.
- `getLeaderboardCounts()` has no dedicated unit test (DB-backed; verified live via
  the rendered 42/30). Add one if we want regression coverage on the count split.

## Progress Update as of 2026-06-05 11:05 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Left-justified the scoring waterfall: the Founder Festival logo was `self-center`
(centered) while the header copy and step rows were left-aligned, so it read as
"some things centered." Removed `self-center` from the logo in both waterfall
surfaces (SplashForm + ReScoreButton) so the whole panel is left-justified.

### Detail of changes made:
- `src/components/SplashForm.tsx` + `src/components/ReScoreButton.tsx`: dropped
  `self-center` from the logo `<img>` className (`w-12 sm:w-14 h-auto`). The step
  list already uses `items-start` and the headers have no centering, so the logo
  was the only centered element in the progress panel. EvalProgress internals
  unchanged (the scoreboard stays a `justify-between` header bar by design).

### Potential concerns to address:
- None new. Bundled with the still-unmerged feasibility doc into a follow-up PR.

---

## Progress Update as of 2026-06-05 10:52 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
PR #175 (rubric v0.0.7 + waterfall sources + Neo endorsements deep-link) was
verified (tsc clean, Vercel preview deploy green) and **squash-merged to main →
deployed to production**. Added a standalone Neo Phase 2 feasibility/decision doc
so the deferred endorsement-quote scrape has a clean go/no-go artifact.

### Detail of changes made:
- Merged PR #175 to `main` (squash commit `65d3a73`). Vercel production deploy
  triggered by the merge.
- `docs/superpowers/specs/2026-06-05-neo-endorsements-phase2-feasibility.md`:
  records the live-probe findings (endorsement content is token-gated; headless
  browser required), the confirmed Bubble endorsement schema, a proposed
  `neo_endorsements` table + cron architecture, and a two-option recommendation
  (A: count-only ~1 hr / B: full quote scrape, multi-day).

### Potential concerns to address:
- The feasibility doc lives on the `worktree-scoring-rubric` branch (committed
  after PR #175 merged); fold it onto main with the Phase 2 work or a trivial
  follow-up if a standalone copy on main is wanted. Its key points are already
  captured in this PRD on main.

---

## Progress Update as of 2026-06-05 10:46 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Audited the scoring rubric doc against the live code and reconciled three gaps
the audit surfaced, all shippable without a schema change: (1) the rubric doc was
~2 days stale (missing dev.to + Neo, an internally-inconsistent uncapped-rule
list); (2) the live scoring "waterfall" (EvalProgress) never showed Neo, HN
Tokenmaxxing, or dev.to even though those enrichers run on every eval; (3) Neo
endorsements had no surface on investor profiles. Neo endorsement-QUOTE scraping
(Phase 2) was investigated and deliberately deferred — see concerns.

### Detail of changes made:
- **Waterfall (`src/lib/eval-steps.ts`):** added three research steps to
  `EVAL_STEPS` so they animate in the live `EvalProgress` reveal as a profile
  scores — "Reading the technical articles you've published on dev.to",
  "Checking your rank on the HN Tokenmaxxing leaderboard", and
  "Cross-referencing Neo for your investor focus and check size". `EVAL_STEPS` is
  cosmetic pacing only (it gates nothing), so this is zero-risk. Added an
  `EVAL_STEPS` regression test block in `tests/lib/eval-steps.test.ts`.
- **Rubric doc → v0.0.7 (`PRD/scoring-rubric-v0.0.1.md`):** added a dev.to
  founder sub-rule section (+2/+6/+6/+4, cap +18); added Neo to the data-sources
  table + a new "Neo sub-rules — evidence-only, zero points" block in the Investor
  Rubric (grounds investor rows + drives badges; no score impact); fixed mechanics
  §2 to list all FOUR uncapped rules (`venture_raised`, `github_top_repo`,
  `founder_exit`, `founder_valuation`) instead of two; refreshed the
  extracted-metrics list (added `ipoMarketCapUsd`, `acquisitionPriceUsd`,
  `peakValuationUsd`); rewrote the stale "known gaps" line.
- **Stale comment (`src/lib/scoring.ts`):** the `MAX_POINTS_PER_ITEM` comment
  said the highest clamped award was +100; the rebalanced Majestic Million curve
  maxes at ~+120 (#1 domain). Corrected; no logic change.
- **Neo endorsements surface (`src/components/NeoEndorsements.tsx` +
  `profile/page.tsx`):** new isolated component rendering an "Endorsements"
  section that deep-links to `neo.com/investor/<slug>` (uses the already-stored
  `neoSlug`; gated on `onNeo === true`). No migration, no new dependency. Unit
  test in `tests/lib/neo-endorsements.test.ts`.
- **Verification:** `pnpm tsc --noEmit` clean; `pnpm build` (the Vercel build)
  succeeds; new tests 12/12 pass. Full suite has 3 failures, ALL pre-existing/
  flaky and unrelated to this branch: the 2 documented `eval-pipeline.test.ts`
  failures (combinedScore 30 vs 67) and `select-top-profiles.test.ts` (passes
  5/5 in isolation — DB-state pollution under the full serial run).

### Potential concerns to address:
- **Neo Phase 2 (endorsement QUOTES) deliberately NOT built.** Live probing of
  neo.com confirmed the endorsement content is NOT fetchable via plain HTTP: the
  Bubble `endorsement` type is private on the public Data API (404), the investor
  page is a non-server-rendered Bubble SPA, and the client `/elasticsearch`
  endpoint is token-gated. Pulling the quotes requires a headless browser
  (Playwright + `@sparticuz/chromium`) on a SEPARATE cron/background path — heavy,
  fragile in Vercel serverless, and a real new-dependency decision. This was left
  for operator go/no-go rather than auto-shipped while the operator was away. The
  endorsement COUNT (`numEndorsements`) IS available for free on the existing
  `obj/user` call and is not yet persisted — a lighter intermediate step would be
  to store it and show "N endorsements" next to the deep link (one nullable
  column → one prod migration).
- **Prod migration access:** this checkout's `.env.local` has prod (`ep-fragrant-
  surf`) creds under the `POSTGRES_*` vars while the app's `DATABASE_URL` points
  at dev (`ep-old-shadow`). No migration was needed for this branch, so none was
  run. Any future Neo Phase 2 / count column will need the documented manual
  `sql.query()`-over-HTTP prod migration.
- **Per-row source attribution** in the static profile breakdown (ScoreTable)
  still doesn't show which enricher drove a row — only the live waterfall step
  list names sources. Noted as a UI gap in the doc's "known gaps".

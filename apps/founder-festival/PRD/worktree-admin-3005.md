## Progress Update as of 2026-06-05 10:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Synced fast-moving main (+26). Resolved recurring FounderStatusMarker + journal
conflicts with --ours (my inline-variant marker is the newest superset).

### Detail of changes made:
- LOCAL-ONLY gotcha: `npm run build` fails on src/lib/stripe.ts apiVersion. The
  repo's canonical lockfile is pnpm-lock.yaml (Vercel builds with it; Stripe
  22.1.1 → "2026-04-22.dahlia" matches stripe.ts). My `npm install` pulled a
  newer Stripe → false mismatch + recreated package-lock.json (removed). tsc shows
  NO other errors. DO NOT npm install in this worktree — use pnpm.

### Potential concerns to address:
- Branch churn: main advancing every few minutes; same files reconflict each sync.

## Progress Update as of 2026-06-05 10:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Leaderboard status markers (check/asterisk) made full-size + baseline (same size
as the founder/investor numbers) instead of small superscripts.

### Detail of changes made:
- FounderStatusMarker `StatusMarker` gains a `variant` prop: "superscript"
  (default — profile page, half-size raised) and "inline" (leaderboard — ~1.1em,
  align-middle, baseline). Tuned both glyph paths to fill the box evenly so the
  check and asterisk read the same visual size. LeaderboardTable's 3 usages
  (mobile card + desktop founder/investor cells) pass variant="inline".

### Potential concerns to address:
- Marker only renders for profiles with founderStatus/investorStatus set (recent
  scores); not headlessly eyeballed. Build/typecheck/lint clean.

### Summary of changes since last update
Standing instruction from DROdio: deploy everything every time (merge PRs to prod,
not just open them). Syncing + landing the profile/leaderboard batch (PR #199).

### Detail of changes made:
- Merge conflict in FounderStatusMarker.tsx: main shipped a glyph-only "darker
  red" tweak; kept MY full SVG rewrite (matched stroke, darker green+red,
  half-size superscript) which supersedes it. LeaderboardTable auto-merged.
  Build + typecheck clean.

### Potential concerns to address:
- Branch is a fast-moving merge target (main advancing every few min); journal +
  marker conflicts recur on each sync.

### Summary of changes since last update
Batch of profile/leaderboard UI fixes + a leaderboard "YOU" correctness bug.

### Detail of changes made:
- **"YOU" bug (important):** the leaderboard labeled a row "you" whenever
  `row.id === highlightEvalId` — but highlightEvalId is the `?e=` param ("the
  profile you navigated from"), so arriving from anyone's profile (e.g. an admin
  on Alex Kim's via "#N on Leaderboard") mislabeled THAT row as you.
  Nothing to do with rescore/claiming. Fix: `getCurrentViewerContext` now returns
  `ownEvaluationId` (users.evaluationId); LeaderboardTable splits `isYou`
  (viewer's claimed eval → the "you" label) from `isHighlighted` (you OR ?e= →
  gold bg + scroll). Threaded youEvalId through page → LeaderboardClient → Table.
  Verified unauth ?e= now shows 0 "you" labels.
- **Waterfall sub-bullets → gold** (`#dfa43a`) text + dot (EvalProgress).
- **Status marker (FounderStatusMarker):** rewrote glyphs → matched-stroke SVGs
  (check + 6-ray asterisk, same strokeWidth 2.25); darker colors (green-700 /
  red-700, past amber-500); half-size (0.5em) + superscript; sits to the RIGHT
  of the number (score spans got whitespace-nowrap so it never wraps below, even
  6-digit numbers).
- **Score section layout:** moved the Leaderboard / HN Tokenmaxxer / Re-Score row
  OUT of the narrow Combined column to a full-width row beneath the three scores,
  each badge whitespace-nowrap, so labels no longer wrap to two lines.

### Potential concerns to address:
- "you"-shows-for-own-row path not headlessly verifiable (needs an authed claimed
  session); logic is `row.id === ownEvaluationId`. Marker visual not eyeballed
  (SVG render); build/typecheck/lint clean.

## Progress Update as of 2026-06-05 08:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Diagnosed + fixed the "rescore failed" the user hit on Jordan Lee. ROOT CAUSE was a
prod-breaking scoring bug from recent main changes (NOT the waterfall PR):
`founderStatus` (and, after syncing main's v0.0.9, `investorStatus`) were added to
SCORING_SCHEMA as bare REQUIRED enums. When the model omits/mis-returns either,
zod safeParse fails on that field (both retries) → scoreWithClaude throws →
reEvaluate throws → /api/rescore returns "rescore failed". Reproduced
deterministically for Jordan Lee via computeFreshScore on dev.

### Detail of changes made:
- src/lib/scoring.ts: `founderStatus` AND `investorStatus` → `.nullable().catch(null)`
  so a missing/invalid value degrades to null ("not yet determined") instead of
  nuking the whole eval. Columns are nullable; eval-pipeline writes them straight
  through. Mirrors the schema's existing `.catch([])` tolerance.
- Verified: re-running computeFreshScore for Jordan Lee now returns type=scored
  (founder 266, investor 0, founderStatus null), 13 findings, and the waterfall
  stepIndex mapping resolves correctly ($320M exit→deep-web-search, tkmx
  rank→Tokenmaxxing step, YC alum→YC step). Confirms BOTH the fix and that the
  new sub-bullets will populate on a successful rescore.
- The "no sub-bullets" symptom was downstream of the failed rescore (no findings
  came back); it resolves once rescores succeed.

### Potential concerns to address:
- This bug affected ALL evals/rescores where the model didn't emit a valid
  founderStatus/investorStatus (likely intermittent) — shipping as a hotfix.

## Progress Update as of 2026-06-05 08:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Built the waterfall redesign: findings now fold in as indented sub-bullets under
the checkmarked research step that produced them (approach A), instead of as a
flat list of rows after "Computing your score." Spec at
docs/superpowers/specs/2026-06-05-waterfall-nested-findings-design.md.

### Detail of changes made:
- src/lib/eval-steps.ts: `mapFindingToStep({sources, platform, rubric}) → stepIndex`
  (account match by platform; score finding by source host; sourced-unknown →
  deep-web-search; sourceless → rubric's "Evaluating…" step). `TallyItem` gains
  `stepIndex`; `buildScoreTally` now reads each row's `sources` (already present
  on the /api/eval + /api/rescore breakdown items at runtime — rowToResult passes
  them through) and `buildFoundIdentities` maps by platform.
- src/components/EvalProgress.tsx: render the steps list and nest the revealed
  findings as sub-bullets under their parent step (grouped by stepIndex);
  two-phase reveal kept via the existing `completed` counter; scoreboard + dwell
  unchanged; scroll follows the latest revealed finding in phase 2.
- tests/lib/eval-steps.test.ts: +mapping tests (15 pass). Build/typecheck/lint clean.

### Potential concerns to address:
- Visual reveal not eyeball-verified headlessly (no DB/logic risk; the mapping is
  unit-tested). Triggers on the next initial eval / re-score.

### Summary of changes since last update
Prod push of #184 fully complete (prod backfill seeded all 2,391 rows). Starting
the waterfall redesign (findings as sub-bullets under their source step). Synced
branch with origin/main (+12: founderStatus, more search/leaderboard work) ahead
of the new work.

### Detail of changes made:
- Merge: only conflict was drizzle/meta/_journal.json — took main's (superset:
  has my 0033 scoring_runs via the #184 squash + main's 0034 founderStatus).
  schema.ts auto-merged with BOTH scoringRuns + founderStatus; db:generate
  reports no pending migration. src/ merged cleanly.

### Potential concerns to address:
- This branch was squash-merged (#184) but I'm continuing on it; journal merges
  need "take main's" each sync. A fresh branch would've been cleaner.

### Summary of changes since last update
Second merge of origin/main (search/relationship-matrix work landed). Resolved
the single profile/page.tsx conflict (dropped the legacy `const {founder,investor}
= legacy` line — only ScoreDetailButton used it, and that's gone from this page;
kept main's new buildMatrix/matrixFounder/matrixInvestor). Build + typecheck +
12 feature tests pass. Main is still advancing rapidly (PR #185 tkmx identity
tier, etc.) — need a brief push-freeze to land PR #184.

### Detail of changes made:
- profile/page.tsx conflict at the matrix/recs boundary resolved; no markers left.

### Potential concerns to address:
- (carried) After deploy, sanity-check a prod profile's Scoring Log + Score Detail.

### Summary of changes since last update
Merged origin/main (12 commits ahead: leaderboard sorting/badges, scoring v0.0.8,
low-signal profile page, HN content-discovery, admin pill delete) into the branch
and fixed the prod backfill for the large prod DB.

### Detail of changes made:
- Merge conflict was only in profile/page.tsx (2 hunks). Resolved toward this
  branch's spec: pill imports keep ScoringLogButton + NeoEndorsements (dropped
  ScoreDetailButton — not used on the profile page anymore); pill actions keep
  AdminProfileActions (Hide | Delete as links) and drop main's standalone
  AdminDeleteButton (AdminProfileActions already covers Delete). Removed the now-
  unused AdminDeleteButton import. tkmx badge + getTkmxBadge survived next to the
  (now containment-fixed) leaderboard badge. recordScoringRun hook intact in the
  auto-merged eval-pipeline.ts. Build + typecheck + 12 feature tests pass.
- AdminDeleteButton.tsx (main's new file) is left in the tree but unused.
- Backfill fix: prod (2,393 evals) blew Neon's 64MB HTTP response cap when the
  script read all rows (big profile blobs) at once. Rewrote
  scripts/backfill-scoring-runs.ts to fetch ids first, then read+insert in
  chunks of 25. Verified on dev (re-seeded 54 rows in chunks).

### Production status:
- PROD DB: scoring_runs table + index CREATED (ep-fragrant-surf, 2393 evals).
  Backfill being re-run by DROdio with the chunked script.
- Deploy: PR #184; DROdio merges to main → Vercel deploys.

### Potential concerns to address:
- After deploy, sanity-check a prod profile's Scoring Log + verbose Score Detail.

### Summary of changes since last update
Made Score Detail exhaustively verbose — it now surfaces every scoring input we
persist — ahead of pushing the scoring-log feature to production.

### Detail of changes made:
- Audited the rubric (scoring.ts) + pipeline (eval-pipeline.ts, enrichers,
  identity, exa-grounding) for every scoring input (see subagent inventory).
- `ScoreDetail.tsx` rewritten to render: Scores, Identity block (+ fullName /
  domain / email / githubUsername), per-row breakdown WITH verification tier +
  confidence + source links (the verification-weighting inputs), Investor facets,
  Extracted metrics, EACH enrichment source's raw payload (github/hn/npm/hf/so/
  nfx/neo/sec-edgar/devto/hn-tokenmaxxing/…), Recommendations + summary metadata,
  Exa grounding (structured + citations + raw), MM hits, Cost & token usage
  (tokens/costUsd/source/genId/cents/pricing), expanded eval metadata, and
  raw-profile + raw-grounding catch-alls so nothing is ever hidden.
- Snapshot enriched with `meta` (eval-row scoring fields not in `profile`:
  investor facets, pricing, cost cents, summary metadata, subject location,
  slug). `ScoreDetailMeta` type; wired through scoring_runs snapshot,
  ScoringLogButton DTO/runToDetailData, and the /not-this-round debug path. The
  `breakdown` snapshot already carried sources/confidence/verification per item.
- No DB migration needed (snapshot is jsonb; only added a sub-key). Re-seeded
  dev scoring_runs (237 rows) so backfilled snapshots include `meta`.
- Tests extended (scoring-runs meta round-trip). Build + typecheck + lint clean.

### Potential concerns to address:
- Score Detail renders some varied/nested blobs (enrichment raw, pricing) as
  formatted JSON — deliberate, to guarantee completeness for an admin/debug view.
- (carried) Prod DB needs the additive scoring_runs migration + backfill before
  the reading code is deployed — doing this now as part of the prod push.

### Summary of changes since last update
Added the HN Tokenmaxxing badge to the profile page, next to the leaderboard
badge.

### Detail of changes made:
- Badge reads the rank + tkmx username the existing `hn-tokenmaxxing` enricher
  already persists at scoring time onto `evaluations.profile.enrichments[].raw`
  (`{ username, rank, ... }`). No live fetch on render — fast + independent of
  tkmx.odio.dev uptime; refreshes on re-score like every other scored fact.
- `src/lib/tkmx-badge.ts` `getTkmxBadge(profile)` → `{ rank, username,
  profileUrl }` or null (null when unranked/listed-only or no enrichment).
- Profile page: gold badge `#<rank> HN Tokenmaxxer` right of the leaderboard
  badge, `rounded-md` (less rounded, matching the achievement Badges) vs the
  leaderboard badge's `rounded-full`, links to `https://tkmx.odio.dev/u/<username>`
  with target=_blank + rel=noopener.
- `tests/lib/tkmx-badge.test.ts` (5). Verified end-to-end on :3005 by temporarily
  injecting a tkmx enrichment into a dev profile (badge rendered with correct
  href/target/rel/rounding), then reverting.

### Potential concerns to address:
- No dev profile is a ranked tkmx member (0/225), so the badge only shows in the
  wild for subjects whose HN handle matches a tkmx leaderboard member. drodio's
  prod profile should show it after a (re)score that runs the enricher.
- (carried) Prod DB still needs the additive `scoring_runs` migration + backfill
  before deploy.

### Summary of changes since last update
Fixed three reported bugs in the scoring-log / re-score UI.

### Detail of changes made:
- Re-score progress (`EvalProgress`) + finale tally were center-aligned: the
  modal renders inside the profile page's `.text-center` subtree and inherited
  centering (only visible on wrapped lines). Added `text-left` to EvalProgress
  root and to the ReScoreButton modal container (logo keeps its `self-center`).
- "Scoring Log" opened a tiny black box: the admin pill has `backdrop-blur`
  (a `backdrop-filter`), which makes it the containing block for `position:fixed`
  descendants — so the modal's `fixed inset-0` was clipped to the pill instead of
  the viewport. Fixed by portaling both the Scoring Log table modal and the
  `ScoreDetail` modal to `document.body` (new `useMounted` hook via
  useSyncExternalStore guards SSR, lint-clean — no set-state-in-effect).

### Potential concerns to address:
- (carried) Prod DB still needs the additive `scoring_runs` migration + backfill
  before deploy.

### Summary of changes since last update
Implemented the full Scoring Log feature end-to-end and consolidated the admin
pill. Score history is now persisted on every scoring run, the profile admin
pill reads `Admin: Scoring Log | Re-Score | Hide | Delete` (all hyperlinks), and
the "Scoring Log" link opens a table of runs whose rows expand into the existing
Score Detail view. Build + typecheck + lint clean; 703 tests pass (the 4 failing
are pre-existing dev-DB/data-dependent failures, confirmed against a clean tree).

### Detail of changes made:
- DB: new `scoring_runs` table (`src/db/schema.ts`) — scalar summary columns +
  immutable `snapshot` jsonb + `(evaluation_id, created_at desc)` index.
  Migration `drizzle/0033_chunky_norrin_radd.sql` generated; applied to DEV via
  `scripts/apply-scoring-runs-migration.ts` (idempotent CREATE TABLE IF NOT
  EXISTS). 195 dev evals backfilled via `scripts/backfill-scoring-runs.ts`
  (npm: `backfill-scoring-runs`), idempotent (verified 0 inserts on re-run).
- Write hook: `src/lib/scoring-runs.ts` (`scoringRunValuesFromRow` +
  `recordScoringRun`), called best-effort (`.catch(()=>{})`) from both `runEval`
  and `reEvaluate` in `eval-pipeline.ts`. Built straight from the persisted eval
  row, so the live hook and the backfill share one snapshot definition.
- API: `GET /api/admin/profile/[evalId]/scoring-runs` — gated `isLocalhost ||
  superAdmin` (mirrors the page's showScoreDetail), returns runs newest-first
  with full snapshot (no second fetch for detail).
- UI: extracted presentational `ScoreDetail.tsx` (overlay+panel+copy/debug) from
  `ScoreDetailButton.tsx` (now a thin trigger, still "Score Detail" on
  /not-this-round + ?debug=1). New `ScoringLogButton.tsx` = pill trigger + run
  table + row→ScoreDetail. `AdminProfileBox` interleaves " | " separators;
  `AdminProfileActions` (Hide/Delete) restyled as inline hyperlinks and MOVED
  into the pill (super-admin-only); old in-page actions row removed.
- Tests: `tests/lib/scoring-runs.test.ts` (6) — snapshot round-trip
  (eval row → run values → DTO → ScoreDetailData) + backfill createdAt + empty
  breakdown fallback.
- Verified on :3005 — /profile pill renders "Admin: Scoring Log | Re-Score"
  (Hide/Delete correctly hidden for non-superadmin), scoring-runs API returns
  backfilled runs, /not-this-round still shows Score Detail.

### Potential concerns to address:
- PROD not touched. Before deploying code that reads `scoring_runs`, run the
  additive migration + backfill on prod (ep-fragrant-surf): apply via
  `APPLY_DB_URL="$POSTGRES_URL_NON_POOLING" scripts/apply-scoring-runs-migration.ts`
  then the backfill against the prod URL. Additive/backward-compatible.
- Label decision: kept "Score Detail" on /not-this-round + /admin/profiles
  (?debug=1) rather than renaming to "Scoring Log" everywhere — only the profile
  pill shows the full history. Revisit if global consistency is wanted.
- Pre-existing test failures (eval-pipeline ×2 MM-bonus/timeout, rescore-all,
  select-top-profiles cross-suite DB contamination) are unrelated to this work.

### Summary of changes since last update
Branch kickoff. Brainstormed and wrote the design spec for the Scoring Log
feature: consolidate the profile admin pill into hyperlinks
(`Admin: Scoring Log | Re-Score | Hide | Delete`) and persist an immutable
snapshot of every scoring run so super-admins can see score history over time.

### Detail of changes made:
- Spec committed at `docs/superpowers/specs/2026-06-05-scoring-log-design.md`.
- Key finding: scoring OVERWRITES the `evaluations` row in place (`reEvaluate`
  in `src/lib/eval-pipeline.ts`), so all prior scores are discarded today. The
  feature adds a `scoring_runs` table written from both `runEval` (first score /
  bulk cron) and `reEvaluate` (re-score), plus a one-time backfill of the
  current score per evaluation.
- The "Scoring Log" link opens a table of runs (newest first); clicking a row
  rebuilds the existing Score Detail view from that run's `snapshot`. This
  requires extracting a presentational `ScoreDetail` from `ScoreDetailButton`.
- Admin pill (`AdminProfileBox`) becomes the single home for super-admin actions;
  Hide/Delete move out of the in-page `AdminProfileActions` row into the pill.
- DB env mapping in this repo's `.env.local`: `DATABASE_URL*` -> dev
  (ep-old-shadow), `POSTGRES_URL*` -> prod (ep-fragrant-surf). Migration applied
  to DEV ONLY via idempotent `CREATE TABLE IF NOT EXISTS`; prod is DROdio's
  deploy-time step. Never `db:push`.

### Potential concerns to address:
- `eval-pipeline.ts` is ~1090 lines; the write hook must stay best-effort so a
  history-write failure can never fail a paid score.
- Backfill can only recover the CURRENT score per profile — earlier re-score
  history is genuinely unrecoverable.
- Prod DB needs the same additive migration + backfill before the code that
  reads `scoring_runs` is deployed.

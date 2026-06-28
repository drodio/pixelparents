# Branch: `events-v1` — progress log

## Progress Update as of 2026-05-27 09:10 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added **Re-run failed scans** (retry-in-place, failed only). Fast-forwarded to main
first (PRs #95-98: my consolidation merged + PostHog/Vercel-analytics + the
**fix-scoring-concurrency** PR #96 that rewrote the tick with atomic claim — likely
the cause of the failures the user saw). Cleared ~5.4 GB of other worktrees' .next
caches to get past a full-disk (ENOSPC) block, then `pnpm install` for the new deps.

### Detail of changes made:
- New `POST /api/admin/jobs/[id]/retry-failed`: resets a run's `failed` items to a
  claimable status (`resolved` if a LinkedIn URL is present, else `pending`), clears
  error/timestamps, re-opens the job (`queued`, `completedAt=null`, optimistic
  `failedItems` decrement). Gated `run_scoring_jobs` + `canAccessJob`; credit hold for
  the retried share (402 on insufficient; no-op while enforcement off). The rewritten
  tick claims `pending`/`resolved` and re-derives counts on completion, so the reset
  items get re-attempted automatically. TDD: `tests/app/retry-failed.test.ts` (3 cases).
- `listProfilesForJob` now returns `job.failedItems` (live count of `failed` items).
- `RetryFailedButton` (client) on the single-run view header, shown when canRun and
  `failedItems > 0`; confirms, POSTs, `router.refresh()`. Header now also shows
  "· N failed".
- Spec: docs/superpowers/specs/2026-05-27-retry-failed-scans-design.md.

### Potential concerns to address:
- Credit reconciliation for in-place retry under enforcement (off today) can
  under-refund slightly — documented inline; precise fix needs delta-accounting.


## Progress Update as of 2026-05-27 11:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` into events-v1 ahead of shipping Phase B. Main had built a
**parallel "Credits" feature** — a real `/admin/credits` user-credits admin page
(always-on nav) + role-scope (`getViewerScopes`/`getViewerEmail`, "theirs"-scoped
admins) + migrations 0017/0018. Resolved 4 conflicts.

### Detail of changes made (conflict resolution):
- **Nav reconciliation:** main's `/admin/credits` (real user-credits page) is now
  the "Credits" item (always-on, $-coin icon — the user's intent); my earlier
  `/admin/spend`-as-"Credits" was renamed to **"Spend"** (FiDollarSign) — it's the
  AI/Exa cost dashboard, kept reachable now that /admin/score is gone. Order:
  Credits, Bulk Score, Scored Profiles, Spend, Manage Events.
- **Role-scope carried into /admin/profiles:** profiles list + Runs panel now honor
  `ownerEmail` ("theirs"-scoped admins see only their own jobs/profiles); Re-Run All
  hidden for scoped admins; "Showing only profiles from bulk jobs you created" note.
- `/admin/score` modify/delete conflicts → kept DELETED (Phase B retires it).
- `admin-nav.test.ts`: assertions updated for always-on Credits + my activeNavHref;
  isActiveNav examples moved off the deleted /admin/score.
- Verified: drift guard "No schema changes"; tsc clean; build green (/admin/credits
  + /admin/spend + /admin/profiles* present, no /admin/score); 31/31 key tests pass.


## Progress Update as of 2026-05-27 11:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase B task 6 (final): deleted `/admin/score`, `/admin/score/new`, `/admin/score/[id]` pages and `JobProgress.tsx` component; hub card on `/admin` repointed from `/admin/score` to `/admin/profiles/new`; residual `/admin/score` references in doc comments updated in `admin-nav.ts` and `eval-pipeline.ts`; `/admin/score` fully retired. Build clean, 8/8 admin-nav tests pass, 3/3 rescore-all tests pass, route table shows no `/admin/score` routes.

### Detail of changes made:
- `src/app/(authed)/admin/page.tsx`: changed "Bulk Score Founders & Investors" `HubCard` href from `/admin/score` to `/admin/profiles/new`. Icon, title, and body unchanged.
- Deleted via `git rm`: `src/app/(authed)/admin/score/page.tsx`, `src/app/(authed)/admin/score/new/page.tsx`, `src/app/(authed)/admin/score/[id]/page.tsx`, `src/components/admin/JobProgress.tsx`. Empty `src/app/(authed)/admin/score/` directory tree removed.
- `src/lib/admin-nav.ts`: updated doc comment example from `/admin/score/<id>` to `/admin/profiles/<id>`.
- `src/lib/eval-pipeline.ts`: updated two doc comments referencing `/admin/score` to `/admin/profiles`.
- `src/db/schema.ts`: one comment still references `/admin/score/<id>` — left unmodified per explicit task constraint "Do NOT modify src/db/schema.ts".
- Backend API routes (`/api/admin/jobs`, `/api/admin/jobs/[id]`, `/api/admin/rescore-all`, `/api/cron/scoring-tick`) untouched.

### Potential concerns to address:
- One residual `/admin/score/<id>` reference remains in `src/db/schema.ts` line 66 as a doc comment. It's non-functional (no import/href), left intentionally per task constraint.
- Pre-existing `LayoutProps` TypeScript errors in layout files (`src/app/(authed)/admin/layout.tsx`, `src/app/(authed)/layout.tsx`, `src/app/layout.tsx`) remain unchanged from before this task.

## Progress Update as of 2026-05-27 02:45 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase B task 5: `JobLiveProgress` live island added to `/admin/profiles/[jobId]`; polls `/api/admin/jobs/<id>` every 4s, auto-drives the localhost cron tick, shows progress bar + in-flight items table (not-yet-done only), calls `router.refresh()` once when the job reaches a terminal status; gate widened to `view_profiles OR run_scoring_jobs` so scoring-only admins redirected post-create can watch their run.

### Detail of changes made:
- Created `src/components/admin/JobLiveProgress.tsx`: `"use client"` island. Polls `/api/admin/jobs/${jobId}` every 4s. On localhost + non-terminal status fires one `/api/cron/scoring-tick` at a time (guarded by `tickingRef`). On terminal status calls `router.refresh()` once (guarded by `refreshedRef`) to pull newly-scored profiles into the server-rendered table below. Renders: a compact terminal summary line when done+no-pending, otherwise progress bar + header (model/status/counts/costs) + in-flight items table (filters to `status !== "done"`). Re-run link points to `/admin/profiles/<rerunOfJobId>` (not the old `/admin/score`). `JobLiveProgress` accepts `jobId` and `costMultiplier`.
- Modified `src/app/(authed)/admin/profiles/[jobId]/page.tsx`: added `JobLiveProgress` import; widened gate from `can("view_profiles")` alone to `can("view_profiles") || can("run_scoring_jobs")`; rendered `<JobLiveProgress jobId={jobId} costMultiplier={costMult} />` between the header block and the profiles table/empty-state block. `getViewerCostMultiplier` and `costMult` were already present from Phase A — no new await needed.

### Potential concerns to address:
- `JobLiveProgress` polls regardless of terminal state (the interval keeps running); the `router.refresh()` guard prevents double-refresh but the interval itself still fires after terminal. Could add a `clearInterval` on terminal to stop unnecessary polling — low priority.
- `/admin/score` and `JobProgress.tsx` still exist; will be deleted in a later Phase B task.
- Pre-existing lint errors in unrelated files remain unchanged.

## Progress Update as of 2026-05-27 02:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase B task 4: collapsible Runs panel + New Bulk Scoring Job button + Re-Run All on /admin/profiles; RerunButton/RescoreAllButton redirects retargeted from /admin/score to /admin/profiles.

### Detail of changes made:
- `src/components/admin/RerunButton.tsx`: changed post-rerun redirect from `/admin/score/<id>` to `/admin/profiles/<id>`.
- `src/components/admin/RescoreAllButton.tsx`: changed post-rescore-all redirect from `/admin/score/<id>` to `/admin/profiles/<id>`.
- Created `src/components/admin/RunsPanel.tsx`: collapsible `<details>` panel showing up to 50 scoring runs ordered by most-recent-first. Columns: title (links to `/admin/profiles/<id>`), model, status pill, progress (completed+failed/total), est/actual cost (via `applyCostMultiplier`), created time (`LocalTime`), and per-row Re-run button (only for completed/failed/cancelled when `canRun`). Auto-opens if any job is queued or running.
- Modified `src/app/(authed)/admin/profiles/page.tsx`: added imports for `db`, `scoringJobs`, `evaluations`, `count`/`desc`/`eq`, `getEstimateCents`, `RunsPanel`, `RescoreAllButton`; added `canRun` + Phase B data reads (`jobs`, `profileCount`, `sonnetCents`, `opusCents`) after existing `costMult`; wrapped h1+stats in a flex row with a `+ New Bulk Scoring Job` anchor button (shown when `canRun`); inserted `RunsPanel` + `RescoreAllButton` between header and profiles table (both gated on `canRun`).

### Potential concerns to address:
- `/admin/score` still exists with its own Runs list and Re-Run All — will be deleted in a later Phase B task.
- `RunsPanel` renders `<details open={hasActive}>` which is server-rendered; the open state is static on load (no client polling). Active jobs will show stale progress until a manual page refresh.
- `RunRow` type mirrors `scoringJobs` schema columns but is a plain interface — if schema gains columns the type stays in sync only if manually updated.

## Progress Update as of 2026-05-26 11:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase B task 3: Spend summary cards (AI Agents / Deep Research + Vercel balance) extracted to a reusable `SpendSummary` component and rendered atop the Credits page (`/admin/spend`).

### Detail of changes made:
- Created `src/components/admin/SpendSummary.tsx` — exports `SpendSummary({ vercel, recorded, costMult })`. Renders two summary cards ("AI Agents" = LLM, "Deep Research" = Exa) with Vercel account balance line. Accepts `VercelCreditsResult` (discriminated union `ok/data/error`) and `RecordedSpend | null` (`llmCents`, `exaCents`, `totalCents`, `trackedEvals`). Uses `applyCostMultiplier` for per-role cost display. Local `Card` helper handles the `href`-conditional anchor-vs-div rendering.
- Modified `src/app/(authed)/admin/spend/page.tsx`: added imports for `getVercelCredits`, `getRecordedSpend`, and `SpendSummary`; added `Promise.all([getVercelCredits(), getRecordedSpend().catch(() => null)])` after `getViewerCostMultiplier()`; rendered `<SpendSummary>` as the first child of the root `div`, before the existing "Spend detail" header block.
- `/admin/score/page.tsx` is untouched (its `SpendSection` remains in place per task spec).
- Types verified against source: `VercelCreditsResult` from `@/lib/spend/vercel-ai-gateway`, `RecordedSpend` from `@/lib/spend/recorded`, both match exactly.
- Build confirmed: TypeScript clean, lint clean on touched files (pre-existing errors in unrelated files unchanged), `/admin/spend` appears in route table.

### Potential concerns to address:
- `/admin/score` still has its own inline `SpendSection` — duplication is intentional until a later task deletes the entire page.
- Pre-existing lint errors in unrelated files (EventCriteriaBuilder, account pages, etc.) remain; none in files touched here.

## Progress Update as of 2026-05-27 01:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase B task 2: New Bulk Scoring Job page moved to `/admin/profiles/new`; `NewJobForm` and `StaleRescoreForm` redirect targets retargeted from `/admin/score/<id>` to `/admin/profiles/<id>`.

### Detail of changes made:
- Created `src/app/(authed)/admin/profiles/new/page.tsx` — gated on `adminGate()` + `can("run_scoring_jobs")`, renders `NewJobForm` with server-computed cost estimates (same logic as the old `/admin/score/new/page.tsx` but with the extra `can("run_scoring_jobs")` gate).
- `src/components/admin/NewJobForm.tsx`: changed post-create redirect from `/admin/score/${json.jobId}` → `/admin/profiles/${json.jobId}`.
- `src/components/admin/StaleRescoreForm.tsx`: same redirect retarget.
- Build confirmed: `/admin/profiles/new` appears in the route table with `ƒ (Dynamic)`.

### Potential concerns to address:
- `/admin/score/new` still exists and is still reachable (intentional — Phase B later task deletes it).
- Pre-existing lint errors in unrelated files (EventCriteriaBuilder, account pages, etc.) remain; none in files touched here.

## Progress Update as of 2026-05-27 01:10 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Social card now uses the new icon. The user added "Founder Festival Icon Small.png"
to the MAIN repo's public/images (not this worktree); copied it into events-v1 as
`public/images/founder-festival-icon-small.png` (URL-safe kebab-case — spaces in OG
image URLs are fragile for crawlers) and pointed both the OpenGraph and Twitter
`images` in `src/app/layout.tsx` at it.


## Progress Update as of 2026-05-27 01:05 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase B Task 1: Repointed "Bulk Score" nav item from `/admin/score` to `/admin/profiles/new`, added `activeNavHref` helper for most-specific-match highlighting, and updated `AdminNav.tsx` to use it — ensuring `/admin/profiles/new` lights up "Bulk Score" instead of "Scored Profiles" by prefix.

### Detail of changes made:
- `src/lib/admin-nav.ts`: Changed `ADMIN_NAV` Bulk Score entry from `href: "/admin/score"` to `href: "/admin/profiles/new"`. Added exported `activeNavHref(pathname, hrefs)` — iterates hrefs, uses `isActiveNav` to match, returns the longest match (most specific), or `null` if nothing matches.
- `src/components/admin/AdminNav.tsx`: Swapped `isActiveNav` import for `activeNavHref`. Updated `ICONS` map key from `/admin/score` to `/admin/profiles/new`. Derived `activeHref` from `activeNavHref(pathname, items.map(i => i.href))`. Replaced `isActiveNav(pathname, href)` in `cls` helper with `href === activeHref`.
- `tests/lib/admin-nav.test.ts`: Updated import to include `activeNavHref`. Updated `run_scoring_jobs` assertion to expect `/admin/profiles/new` instead of `/admin/score`. Added `activeNavHref` describe block testing most-specific-match logic and null-when-nothing-matches.
- All 8 tests pass; `pnpm tsc --noEmit` clean; lint errors are all pre-existing in unrelated files.

### Potential concerns to address:
- `/admin/score` page still exists and is not yet deleted (that is Task 6). Direct navigation to `/admin/score` will no longer highlight any nav item (the entry no longer exists in `ADMIN_NAV`), but the page still renders. This is intentional — it will be removed in Task 6.

## Progress Update as of 2026-05-27 12:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the Phase B implementation plan:
docs/superpowers/plans/2026-05-27-phase-b-score-consolidation.md. Six tasks:
(1) nav repoint + `activeNavHref` (TDD), (2) /admin/profiles/new + redirects,
(3) SpendSummary → Credits, (4) RunsPanel + New Job/Re-Run All on /admin/profiles,
(5) JobLiveProgress island + widened [jobId] gate, (6) delete /admin/score +
JobProgress + hub card repoint + residual-reference sweep. Tasks 1-5 retarget every
/admin/score reference before task 6 deletes the pages. About to build via subagents.


## Progress Update as of 2026-05-27 12:20 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the **Phase B** design spec (retire /admin/score, fold its machinery onto
/admin/profiles): docs/superpowers/specs/2026-05-27-phase-b-score-consolidation-design.md.
User is away with best-judgment authority, so decisions were made autonomously and
documented (brainstorming approval gate overridden by explicit instruction).

### Detail of changes made (decisions):
- /admin/profiles/[jobId] absorbs JobProgress via a `<JobLiveProgress>` client island
  (poll + localhost auto-driver + progress bar + in-flight items; router.refresh() on
  terminal); rich profiles table stays for scored rows. Gate widened to view_profiles
  OR run_scoring_jobs.
- /admin/profiles gains a collapsible `<RunsPanel>` (jobs list) + "+ New Bulk Scoring
  Job" + "Re-Run All" (canRun-gated).
- New-job flow moves to /admin/profiles/new.
- Spend cards (AI Agents / Deep Research + Vercel balance) move to the Credits
  (/admin/spend) page via a `<SpendSummary>` component.
- Nav: "Bulk Score" repointed to /admin/profiles/new (keeps scoring-only admins able to
  start jobs); add `activeNavHref` for most-specific-match highlighting; hub card repointed.
- Delete /admin/score, /admin/score/new, /admin/score/[id]; reroute all inbound links.
- No DB migration; backend API routes unchanged. Next: writing-plans → build → ship.


## Progress Update as of 2026-05-27 12:05 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Social-card / metadata copy updated in `src/app/layout.tsx`: description +
OpenGraph + Twitter all changed from "festival.so — a gathering for founders." to
"Intimate pop-up IRL events for venture-backed founders and investors." (Standalone
copy tweak; unrelated to the in-progress Phase B score↔profiles consolidation.)


## Progress Update as of 2026-05-26 11:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admin nav + header polish (live feedback batch): an "Admin" shortcut button in
the top-right header (next to the profile, admin-only, mirrors the splash
"Developers" button); admin left-nav reworked — Credits (→ /admin/spend, $-coin
icon) above Bulk Score (now the bar-chart hub-card icon, not a lightning bolt),
Scored Profiles (person icon, moved up from the superadmin section, renamed from
"Profiles") below it; and on /admin/score the Spend cards renamed "Vercel AI
Gateway · LLM" → "AI Agents" and "Exa · search + research" → "Deep Research".

### Detail of changes made:
- `src/app/(authed)/layout.tsx`: server-side `isAdmin()`; renders an "Admin" link
  (developer-button styling) left of `UserBadge` in the fixed top-right cluster.
- `src/lib/admin-nav.ts`: `ADMIN_NAV` reordered — Credits (`/admin/spend`,
  `run_scoring_jobs`), Bulk Score, Scored Profiles (`view_profiles`, moved from
  superadmin → main, relabeled), Manage Events; superadmin section now Pending /
  Admin Users / Admin Roles.
- `src/components/admin/AdminNav.tsx`: icon map now `FaCoins` (spend), `FiBarChart2`
  (score, matches hub card), `FiUser` (profiles), `FiCalendar` (events); dropped
  `FiZap`.
- `src/app/(authed)/admin/score/page.tsx`: Spend card labels → "AI Agents" /
  "Deep Research".
- `tests/lib/admin-nav.test.ts`: run_scoring_jobs now reveals Credits + Bulk Score.

### Potential concerns to address:
- Credits is gated on `run_scoring_jobs` (spend is a scoring-cost concern; the
  /admin/spend page itself is adminGate-only). Super/env admins see it regardless.
- Next up: Phase B — fold /admin/score (live progress, auto-driver, New Job /
  Re-Run All, Spend) onto /admin/profiles, then retire /admin/score.


## Progress Update as of 2026-05-26 11:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Parity fix after the main merge: the single-run `/admin/profiles/[jobId]` view
now applies main's per-viewer cost multiplier too (it previously showed
un-multiplied cost to a non-super `view_profiles` admin). Mirrors what
`/admin/profiles` does — `applyCostMultiplier(p.costCents, costMult)`, charge
left un-multiplied. tsc + build green.

### Detail of changes made:
- `src/app/(authed)/admin/profiles/[jobId]/page.tsx`: import
  `getViewerCostMultiplier` + `applyCostMultiplier`; compute `costMult`; apply it
  to `costCents` in the row mapping (super-admin mult = 1, so unchanged for me).


## Progress Update as of 2026-05-26 11:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` (11 commits ahead: cost-multiplier, scoring-job-runs,
JobProgress/RolesManager updates, grants additions, migrations 0015/0016) into
`events-v1` ahead of shipping Phase A. Two conflicts resolved.

### Detail of changes made:
- `tests/lib/grants.test.ts`: both sides made the same 9-key fix; took main's
  single-line form.
- `src/app/(authed)/admin/profiles/page.tsx`: main had added a per-viewer **cost
  multiplier** (`getViewerCostMultiplier` + `applyCostMultiplier`) but still used
  the OLD inline table; our side replaced that table with `<ProfilesScoredTable>`.
  Kept our component AND preserved main's multiplier by applying
  `applyCostMultiplier(p.costCents, costMult)` to the cost passed into the table
  (charge stays un-multiplied). Header already uses `showCost`.
- drizzle migrations 0015/0016 (from main) merged cleanly; we added none this
  round (Phase A is reads-only). `drizzle-kit generate` → "No schema changes".
- Verified post-merge: `pnpm build` green (both /admin/profiles routes present),
  tsc clean, feature + grants tests 15/15.

### Potential concerns to address:
- Cost multiplier now flows through the shared table's CSV export too (cost
  column reflects the viewer's multiplier; super-admin mult = 1 so unchanged).
  The single-run /admin/profiles/[jobId] view does NOT yet apply the multiplier —
  it's gated on view_profiles, so a non-super viewer would see un-multiplied cost
  there. Worth a follow-up to thread costMult through that page for parity.


## Progress Update as of 2026-05-26 11:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase A build complete + full-suite verification. Fixed a stale unit test:
`tests/lib/grants.test.ts` asserted the GRANTS catalog had 7 keys, but it has
grown to 9 (`view_profiles` + `manage_pending` were added in earlier RBAC work —
`view_profiles` is the grant that gates the new profiles pages). Updated the
expected list. Unrelated to the Phase A diff but adjacent and was red in CI.

### Detail of changes made:
- `tests/lib/grants.test.ts`: expected keys updated to the actual 9-key catalog;
  test renamed "7 documented keys" → "9 documented keys".

### Potential concerns to address:
- `tests/api/redeem.test.ts` (2 tests) returns HTTP 429 (rate-limited) instead of
  200/400 — a pre-existing environmental flake from accumulated `rate_limit` rows
  on the dev Neon branch, NOT caused by Phase A (the redeem route/test are
  untouched). Does not block deploy (Vercel runs `next build`, not vitest).
- Full vitest suite times out a few DB tests only under high parallelism; they
  pass with `--no-file-parallelism`. Worth lowering test concurrency for neon-http.


## Progress Update as of 2026-05-26 11:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase A task 5: single-run view at `/admin/profiles/[jobId]`. Created `src/app/(authed)/admin/profiles/[jobId]/page.tsx` — gated behind `adminGate` + `can("view_profiles")`, validates jobId with `isUuid`, fetches via `listProfilesForJob`, resolves claimer emails via a single batched Clerk call, renders a header (run title / "Untitled run"), back link, "N scored · M not yet scored" count, and the `ProfilesScoredTable` with `showStatus` to expose the per-item Status column. tsc clean, lint clean (pre-existing errors only in other files), build passes, route confirmed in output.

### Detail of changes made:
- New file: `src/app/(authed)/admin/profiles/[jobId]/page.tsx` (force-dynamic, App Router params as Promise).
- Uses `import Link from "next/link"` for back-link (avoids `@next/next/no-html-link-for-pages` lint error).
- Code-review follow-up: extracted the duplicated `fmtLocation` + `resolveEmails`
  helpers into a shared `src/lib/admin-profiles-view.ts` and consumed it from
  BOTH `profiles/page.tsx` and `profiles/[jobId]/page.tsx` so the two views'
  serialization can't drift (was a verbatim copy in each).
- Row serialization matches `profiles/page.tsx` exactly; adds `status: p.status` to each `ProfileTableRow`.
- `<ProfilesScoredTable ... showStatus />` enables the Status column.
- `unresolvedCount` displayed inline in subtitle and empty-state paragraph.

### Potential concerns to address:
- If `listProfilesForJob` returns `job: null` (unknown jobId), the page returns `<NotAuthorized>` — this shows an admin error UI rather than a 404; acceptable for internal admin tooling.
- No pagination; inherits the same 200-item-ish limit that comes from `enrichEvals` scope.

## Progress Update as of 2026-05-26 10:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase A task 4: run pills + Filter control + optional Status column in `ProfilesScoredTable`; `profiles/page.tsx` passes `runs` through from the already-enriched `ScoredProfileRow`. The component now shows inline run-title pills (linking to `/admin/profiles/<jobId>`) in the Source cell, a dropdown Filter popover (source + run checkboxes, Select all/none, badge shows active count), and an optional `showStatus` column for the forthcoming single-run view. tsc clean, lint clean (pre-existing errors only in other files), build passes.

### Detail of changes made:
- `ProfileTableRow` type extended with `runs: { jobId, title | null }[]` and optional `status?: string`.
- Imported `collectFilterLabels` and `rowMatchesFilter` from `@/lib/profile-filter`.
- Source `<td>` now wraps in a flex div and maps `p.runs` into anchor pills pointing at `/admin/profiles/<jobId>`.
- `STATUS_STYLE` constant added at module scope (done/scoring/resolving/resolved/pending/skipped/failed color map).
- Component signature extended with `showStatus?: boolean` (default false); `filterLabels`, `enabled` (Set), `showFilter` state added; `sorted` useMemo now filters first via `rowMatchesFilter` then sorts.
- `toggleLabel(key)` helper toggles a single label key in the enabled Set.
- Filter popover: absolute dropdown with Select all / Select none + checkbox list per label; button shows `(n/total)` badge when some are disabled.
- `colCount` accounts for `showStatus ? 1 : 0` extra column.
- Status `<th>` and `<td>` added conditionally on `showStatus`; cell uses `STATUS_STYLE[p.status ?? ""] ?? "text-zinc-400"`.
- `src/app/(authed)/admin/profiles/page.tsx`: row mapping now passes `runs: p.runs`.

### Potential concerns to address:
- `enabled` state is initialized from `filterLabels` at mount time; if `rows` prop changes (e.g., re-fetch), the filter Set won't auto-expand to include new run keys — acceptable for now since this page does a full server re-render on navigation. (Code-review follow-up: this mount-once assumption is now documented inline at the `enabled` state declaration so a future client-fetching consumer knows to add a sync effect.)
- Status column is intentionally not sortable (no `status` SortKey) per the Phase A spec; revisit if the single-run view needs it.
- Run pills in Source cell may make that column wide on profiles in many bulk runs; no max-width cap yet.

## Progress Update as of 2026-05-26 10:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase A task 3: pure profile-filter helpers (label → visible). Created `src/lib/profile-filter.ts` with three pure functions (`rowLabelKeys`, `collectFilterLabels`, `rowMatchesFilter`) and one type (`FilterableRow`). A profile is shown iff ANY of its labels (source or run) is enabled. Module exports `FilterLabel` type for use by the client-component Filter control. Created `tests/lib/profile-filter.test.ts` with 4 tests (all passing); tsc clean; lint clean.

### Detail of changes made:
- `rowLabelKeys(row)` returns label keys: `source:web|bulk|api` plus `run:<jobId>` for each run.
- `collectFilterLabels(rows)` returns distinct labels across all rows: source labels first (web/bulk/api order) then de-duped run labels (first title per jobId wins; nulls become "Untitled run").
- `rowMatchesFilter(row, enabled)` returns true iff row's labels have ANY key in the enabled Set.
- `FilterableRow` type: `{ source: ProfileSource, runs: { jobId: string, title: string | null }[] }`.
- `FilterLabel` type: `{ key, label, kind: "source" | "run" }` for rendering the UI control.
- No schema/DB changes. Pure logic, fully testable without React or network.

### Potential concerns to address:
- None new. Pure module, no side effects, no external dependencies.


## Progress Update as of 2026-05-26 09:50 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase A task 2: `listProfilesForJob(jobId)` — one run's scored profiles + status + unresolved count. Added new exported function and `JobProfiles` type to `src/lib/profiles-scored.ts`; reuses shared `enrichEvals()` so enrichment matches the main list exactly. Two new tests (happy path + unknown-job null guard) pass; type-check and lint clean.

### Detail of changes made:
- Added `JobProfiles` export type: `{ job: {id,title}|null, rows: ScoredProfileRow[], unresolvedCount: number }`.
- Added `listProfilesForJob(jobId: string): Promise<JobProfiles>` — queries the job row, its items (ordered newest-first to pick the most recent per-eval status), counts unresolved (no evaluationId), builds `statusByEval` Map, calls `enrichEvals()`, maps status onto each enriched row.
- Both new functions inserted between `enrichEvals` and `selectStaleProfiles` as specified.
- No new imports needed — `eq`, `desc`, `inArray`, `scoringJobs`, `scoringJobItems`, `evaluations` already in scope.
- Three tests now live in their own `describe("listProfilesForJob")` block
  (code-review follow-up): happy path, an eval-in-multiple-items dedup case
  (most-recent status wins), and the unknown-job null guard.
- Code-review follow-up: `status` mapped with a non-null assertion since every
  enriched row's id is guaranteed to be a `statusByEval` key.

### Potential concerns to address:
- Pre-existing lint errors in other files (EventCriteriaBuilder, account pages, etc.) are unrelated and were present before this task.


## Progress Update as of 2026-05-26 09:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase A task 1: `listScoredProfiles` now returns `runs[]` (the bulk scoring jobs
each profile belongs to); enrichment logic refactored into a shared `enrichEvals()`
helper that both `listScoredProfiles` and the forthcoming `listProfilesForJob` will
consume so the two can't drift. (Code review follow-up: de-dup loop rewritten to
`has`/`get!` so the `Map.set` isn't a load-bearing no-op.)

### Detail of changes made:
- Added `runs: { jobId: string; title: string | null }[]` (and optional `status?:
  string`) to `ScoredProfileRow` in `src/lib/profiles-scored.ts`.
- Introduced `EVAL_BASE_COLUMNS` const + `EvalBaseRow` type so the select columns
  are declared once and shared.
- Extracted all enrichment (charge, claim, rank, badges, company, href, runs) into
  `enrichEvals(evals: EvalBaseRow[])` — exported from the module boundary only via
  `listScoredProfiles` for now; ready to be called by `listProfilesForJob`.
- `isBulk` in `classifyProfileSource` now derives from `runs.length > 0` instead
  of a separate `bulkSet` — single source of truth.
- Added `scoringJobs` to the schema import (line 2). `selectStaleProfiles` was
  NOT touched (keeps its own local `bulkSet`).
- Test updated: job seeded with `title: "7 YC Founders"`, new assertions confirm
  `runs` on bulk, web, and api rows.

### Potential concerns to address:
- `enrichEvals` is not yet exported; once Task 2 (`listProfilesForJob`) needs it,
  export it or co-locate in a shared module.
- Pre-existing lint errors in other files (EventCriteriaBuilder, account pages,
  etc.) are unrelated to this task and were present before this change.


## Progress Update as of 2026-05-26 09:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the Phase A implementation plan for the profiles ↔ run consolidation:
docs/superpowers/plans/2026-05-26-profiles-run-consolidation.md. Six TDD tasks:
(1) listScoredProfiles returns runs[] (refactor enrichment into shared
enrichEvals); (2) listProfilesForJob(jobId) + status + unresolvedCount; (3) pure
profile-filter helpers (label → visible); (4) ProfilesScoredTable run pills +
Filter control + optional Status column; (5) /admin/profiles/[jobId] route; (6)
verify + ship. Reads-only, no migration. About to execute via subagents.

### Detail of changes made:
- Plan reuses existing enrichment (charge/claim/rank/badges/company/href) via a
  new shared `enrichEvals()` so the single-run view matches the main list.
- Filter logic extracted to a pure `src/lib/profile-filter.ts` for unit testing.
- New dynamic route mirrors the main page's gating/email-resolution, adds a
  Status column (per scoring_job_items.status) and an unresolved-item count.

### Potential concerns to address:
- Filter `enabled` Set is initialized once per mount; new labels appearing
  mid-mount aren't auto-enabled (acceptable: force-dynamic re-mounts per nav).


## Progress Update as of 2026-05-26 09:10 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Wrote the approved design spec for **consolidating the bulk-run view into
/admin/profiles (Phase A)**: docs/superpowers/specs/2026-05-26-profiles-run-consolidation-design.md.
Decisions: consolidate the VIEW first (keep /admin/score running machinery);
show all runs a profile belongs to; run pills in Source link to a persistent
/admin/profiles/<jobId> single-run view (with a Status column); a label Filter
(source + run names, select all/none). No migration. Next: writing-plans.


## Progress Update as of 2026-05-26 08:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
LinkedIn icon swapped from Feather FiLinkedin to the filled square chiclet
(FaLinkedin), LinkedIn-blue. Also: brainstorming the /admin/score → /admin/profiles
view consolidation (decided: consolidate the VIEW first; show all runs a profile
belongs to).


## Progress Update as of 2026-05-26 08:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a **LinkedIn icon** (react-icons `FiLinkedin`) to each profile row in
`/admin/profiles`, inline to the right of the company name, linking to the
person's LinkedIn (`evaluations.linkedin_url`, surfaced via `listScoredProfiles`).
The **CSV export** gained a **"LinkedIn"** column with the actual URL.



### Summary of changes since last update
More /admin/profiles polish:
- **Company name now inline to the right of the founder name** (same row).
- **Badges hidden by default**, behind a top-right **"Badges: [Show|Hide]"**
  toggle. When Show, badges render as a full-width sub-row beneath each profile.
- **"Export CSV"** button (top-right) — exports the **current sorted view** to a
  CSV (name, company, source, scores, rank, cost, charge, user, date scored, IP,
  location, badges); client-side Blob download.
- "Scored" column → **"Date Scored"**; Score Detail link dropped the "↗" arrow.
- Removed the descriptive helper paragraph above the table.

### Note on "Score Detail still not working"
Verified it WORKS on :3002 (events-v1) for both high- and low-signal profiles
(modal auto-opens; no /not-this-round bounce). The fix (011f75a) is only on
events-v1 — a separate :3001 worktree won't have it until events-v1 is pulled
there or shipped.



### Summary of changes since last update
Polished the `/admin/profiles` table per a round of UX feedback:
- Profile name is the **gold `.link`, bold**, never wraps. Company + badges moved
  OFF the name's row into a **full-width sub-row beneath each profile** (spans all
  columns; company clickable, badges to its right). Removed standalone Company +
  Badges columns.
- **Combined score bold.** **Rank is clickable** → `/leaderboard?e=<id>`.
- "When" column renamed **"Scored"**; default sort stays scored-date DESC.
- **IP and Location are now separate, sortable columns** (Location = city, state,
  country). Sortable headers show a ▼/▲ arrow only on the ACTIVE column.
- Source pill + badge chips are less rounded (`rounded`, not `rounded-full`).
- **Light alternating row shading** (zebra) per profile (covers the sub-row too).
- Admin layout `<main>` widened `max-w-5xl` → `max-w-[1600px]` so wide tables
  have room (affects all admin pages).
- tsc + lint clean; routes 200.



### Summary of changes since last update
Enriched `/admin/profiles` with leaderboard-style data + made it sortable.

### Detail of changes made:
- `listScoredProfiles` now also returns: `founderScore`, `investorScore`,
  `combinedScore`, `leaderboardRank` (rank by combined score over the
  non-low-signal/non-code population, via a `rank() OVER` window query, null if
  not rankable), `badges` (computed with `computeBadges` + badge_overrides, like
  the leaderboard), `companyName`/`companyUrl` (clickable), and `profileHref`
  (canonical). Company helper replicated locally to avoid a leaderboard↔
  profiles-scored import cycle.
- New client `ProfilesScoredTable` — renders all columns and is **sortable by any
  column (descending-first, click again to toggle asc)**; nulls sort last. The
  header cell `SortableTh` is module-level (avoids the "components created during
  render" lint rule). No separate "claimed" column — the User column conveys it.
- `/admin/profiles/page.tsx` builds serialized rows (resolved emails, ISO time,
  joined location) and renders the client table.
- tsc clean; ProfilesScoredTable lint clean; profiles-scored + stale tests green.



### Summary of changes since last update
Fixed the admin **Score Detail** button: for LOW-SIGNAL profiles, `/profile?e=…&debug=1`
was bouncing to `/not-this-round` (the low-signal redirect ran before the
admin/debug check), so the detail never showed. Moved the super-admin/localhost +
`debug` computation above the low-signal redirect and gate that redirect on
`!autoOpenScoreDetail`. Now an admin with `?debug=1` sees any profile (incl.
low-signal) + the auto-opened Score Detail; normal visitors still get
/not-this-round. Verified on dev. Also re-purged dev fixtures (126→54).



### Summary of changes since last update
Merged origin/main (admin **left-nav refactor**: `AdminNav.tsx` + `admin-nav.ts`;
clean, grant gating for Access/Roles preserved). Then 3 tweaks to the
"Re-Score Existing" job builder:
- Label "Not scored since" → **"Scored before:"** + help text says "on or before".
- Cutoff is now **inclusive (≤)**: `selectStaleProfiles` uses `lte` (was `lt`),
  so it matches profiles last scored ON OR BEFORE the picked date/time.
- `DateTimePickerModal` header gained **Month + Year dropdowns** (jump directly
  to any year without stepping through months); ‹ › arrows still step months.

### Note:
- The cutoff wire field is still named `notScoredSince` (historical); it now
  means "scored on or before this cutoff." Comment updated to flag this.
- Committed locally on events-v1; not pushed/shipped yet (no migration involved).



### Summary of changes since last update
Two tweaks to the "re-score stale profiles" job builder (which came from main):
renamed the mode-toggle button to **"Re-Score Existing"**, and replaced the
`<input type="datetime-local">` "Not scored since" field with a custom
click-to-open **calendar + time picker modal**.

### Detail of changes made:
- New `src/components/admin/DateTimePickerModal.tsx` — trigger button → modal
  with a clickable month calendar (prev/next, today ring, gold selected day) + a
  time field; emits the datetime-local string format so callers' `new Date(v)`
  logic is unchanged.
- `StaleRescoreForm.tsx` — uses the modal; submit-button fallback label →
  "Re-Score Existing".
- `NewJobForm.tsx` — mode-toggle label "Re-score stale profiles" → "Re-Score Existing".
- tsc clean; new files lint clean; /admin/score/new renders 200.

### Also: add-admin feature (PR #84) shipped to prod — /admin/access 200, both
new API routes 403 to unauth. No migration was needed.



### Summary of changes since last update
Added proactive "Add admin" to `/admin/access`: a super-admin (or
approve_admin_requests holder) can browse ALL Clerk users (paginated) AND search
by name/email, pick one, choose a role, and grant admin directly — no prior
request needed.

### Detail of changes made:
- `grantAdminAccess()` + `approvedClerkUserIds()` in `admin-access.ts`
  (upsert an approved row keyed on clerkUserId; flag already-admins).
- `POST /api/admin/access/grant` (gated approve_admin_requests; snapshots the
  Clerk user's email/name/avatar server-side; upserts approved row).
- `GET /api/admin/clerk-users?q=&offset=` (gated): no q → page of all users
  (newest first, Load more); with q → Clerk search. Each flagged alreadyAdmin.
- `AddAdmin` client component (collapsible "+ Add admin": list + search + role
  select + Add) wired above the table on `/admin/access`.
- Tests: `tests/app/admin-access-grant.test.ts` (5: grant+snapshot+role, upsert
  pending→approved no dup, 403 no-grant, 400 missing id, 404 unknown Clerk user).
  tsc clean; access suite 19 pass.

### Note:
- Built in THIS worktree (events-v1, dev server :3002). A separate dev server on
  :3001 (other worktree) won't have these routes until events-v1 is pulled there
  or shipped.



### Summary of changes since last update
Final Phase 2a holistic review (opus): ship-ready, no security gaps. Applied the
one Important fix it found — `/admin/access` page gated on `isSuperAdmin()` only
while its nav link + decision API allow `approve_admin_requests`, so a role-admin
with that grant saw the nav item but hit NotAuthorized. Page gate is now
`isSuperAdmin() || can("approve_admin_requests")`, matching nav + API. tsc clean,
route 200.

### Phase 2a status: COMPLETE
- Reviewer-confirmed: every admin mutation gated server-side; resolver fails
  closed (pending/denied/signed-out/unknown-grant → no grants); no role-admin
  self-elevation; role-in-use delete blocked; super-admins unaffected.
- Minor non-blocking notes (deferred): `delete_events` grant is inert (no
  event-delete feature exists yet); RolesManager shows create+edit controls
  regardless of which of create_roles/edit_roles the viewer holds (server still
  gates); audit-email casing varies (display only).

### Potential concerns:
- **Prod migration 0014 must be applied before Phase 2a ships** (additive).

## Progress Update as of 2026-05-26 05:16 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admin RBAC Phase 2a COMPLETE — roles + grants. Final task (T8) gated the admin
UI controls + nav by grant. The admin nav now shows a **Roles** link and gates
both Access and Roles by grant (super-admins still see all). Score-page
run-scoring controls are gated by `run_scoring_jobs`; the Events create link is
gated by `create_events`. tsc clean; the Phase 2a + affected suite passes
(7 files / 38 tests); `/admin`, `/admin/roles`, `/admin/access`, `/admin/score`,
`/admin/events` all return 200.

### Detail of changes made:
- `src/app/(authed)/admin/layout.tsx`: import `can` from `@/lib/grants`; compute
  `canApprove = can("approve_admin_requests")` and
  `canManageRoles = can("create_roles") || can("edit_roles")` alongside the
  existing `superAdmin`. Access link now gated by `(superAdmin || canApprove)`;
  added a **Roles** link gated by `(superAdmin || canManageRoles)` right after
  Access. Score / Events / Profiles / Pending items / Back stay visible to all
  admins (each page gates its own actions).
- `src/app/(authed)/admin/score/page.tsx`: import `can`; compute
  `canRun = can("run_scoring_jobs")`. The "+ New Bulk Scoring Job" link,
  `<RescoreAllButton>`, and per-row `<RerunButton>` (ANDed with the existing
  status check) now render only when `canRun`. Props/logic unchanged.
- `src/app/(authed)/admin/events/page.tsx`: import `can`; compute
  `canCreate = can("create_events")`; the "+ New event" link renders only when
  `canCreate`. Event detail edit/delete already gated server-side.

### Prod migration note:
- **Prod migration 0014 (`admin_roles` table + `admin_access.role_id` column)
  must be applied to prod before this ships** (operator runs it; it is additive,
  no auto-migrate on deploy). Role-less approved admins remain full admins, so
  no data seed is needed. Per-grant scope (theirs/all) is Phase 2b.

### Potential concerns to address:
- UI gating is defense-in-depth on top of the server-side grant checks in the
  API routes (T5); hiding a control does not by itself authorize anything, but
  the two must stay in sync as grants are added.
- Until migration 0014 is applied to prod, `can()` reads against `admin_roles` /
  `role_id` would fail there — ship order matters.

## Progress Update as of 2026-05-26 05:12 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
RBAC Phase 2a Task 7 complete: the `/admin/roles` page now lets a super-admin
(or anyone with `create_roles`/`edit_roles`) create, edit, and delete roles via
a new `RolesManager` client component wired to the existing
`/api/admin/roles` CRUD routes. tsc clean; no new lint in these files;
`/admin/roles` returns 200.

### Detail of changes made:
- `src/app/(authed)/admin/roles/page.tsx`: server component (force-dynamic).
  Gated by `isSuperAdmin() || can("create_roles") || can("edit_roles")`;
  otherwise renders `<NotAuthorized email={...} />`. Loads roles via
  `listRoles()`, serializes to `{id, name, grants}`, and renders `RolesManager`
  with `GRANTS` as the grant catalog. Internal links use `<a href>` (consistent
  with other admin pages) and links to `/admin/access` for role assignment.
- `src/components/admin/RolesManager.tsx`: client component. New-role form
  (name + grant checkboxes) POSTs to `/api/admin/roles`. Per-role inline Edit
  toggles a grant-checkbox panel that PATCHes `{grants}`. Delete confirms then
  DELETEs; the API's 409 ("role is assigned to one or more admins — reassign
  them first") is surfaced verbatim in the error banner. All mutations call
  `router.refresh()` on success; a single `busy` flag disables controls during
  in-flight requests.

### Potential concerns to address:
- Edit only PATCHes `grants`, not `name` (rename is unsupported in the UI even
  though the API accepts `name`). Acceptable for now per the Task 7 spec.
- UI is not yet grant-gated at the control level / nav (that's Task 8); the page
  itself is gated, but finer-grained control hiding remains.

## Progress Update as of 2026-05-26 05:08 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
RBAC Phase 2a Task 6 complete: a super-admin can now assign a role when
approving an admin-access request on `/admin/access`. Approving with no role
selected leaves `role_id` NULL (= full access, the prior behavior); selecting a
role persists its id. Denying always clears `role_id`. tsc clean; 8 tests pass
against live dev Neon; `/admin/access` route returns 200.

### Detail of changes made:
- `src/lib/admin-access.ts`: `decideAdminAccess` gained optional `roleId`. It
  writes `role_id = (approved ? roleId ?? null : null)` — so a denial (or a
  re-decision to deny) always nulls the role.
- `src/app/api/admin/access/[id]/decision/route.ts`: `Body` now has optional
  `roleId`; the route validates it with the existing `isUuid` and passes
  `roleId: isUuid(body.roleId) ? body.roleId : null` to `decideAdminAccess`.
  Stale "Phase 1 / Phase 2" security comment replaced with an accurate one.
- `src/app/(authed)/admin/access/page.tsx`: now `Promise.all([listAdminAccess(),
  listRoles()])`, builds a `roleId → name` map, adds `roleId` + `roleName` to the
  serialized rows, and passes `roles={[{id,name}]}` to `<AdminAccessTable>`.
- `src/components/admin/AdminAccessTable.tsx`: `AccessRow` gained `roleId` +
  `roleName`; component takes a `roles` prop. Pending rows render a role
  `<select>` (default "— no role (full access) —") whose value is tracked in a
  `roleByRow` Record and sent in the decision POST body. Approved rows show their
  role name (or "full access") under the status pill.
- `tests/app/admin-access-decision.test.ts`: added `seedRole()` (seeds
  `admin_roles`, cleaned up AFTER access rows due to the role_id FK) and two
  tests — approve-with-roleId persists `roleId`; approve-without-role leaves it
  NULL. Existing tests unchanged (8 total).

### Potential concerns to address:
- The dropdown only offers roles that exist; a super-admin must create roles
  first (Task 7's `/admin/roles` page). With no roles, only "full access" is
  selectable — acceptable.
- There's no UI yet to CHANGE an already-approved admin's role (you'd delete +
  re-approve). Out of scope for Task 6; revisit if needed.

## Progress Update as of 2026-05-26 05:01 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
RBAC Phase 2a Task 5 complete: swapped the legacy `isAdmin()`/`isSuperAdmin()`
gates on the existing admin API routes for `requireGrant(<grant>)` from
`@/lib/grants`. Behavior is unchanged for super-admins and env-bootstrap
(`ADMIN_EMAILS`) admins (they hold ALL grants) — this only narrows role-admins.
Both gate-mocking tests were updated to the grant-based pattern. tsc clean; both
tests pass (9 tests) on two consecutive runs against live dev Neon.

### Detail of changes made:
- Gated routes (mutations only): `rescore-all` POST → `run_scoring_jobs`;
  `jobs` POST → `run_scoring_jobs`; `jobs/[id]` POST/rerun → `run_scoring_jobs`;
  `events` POST → `create_events`; `events/[id]/applicants/[applicantId]` PATCH
  → `manage_events`; `events/[id]/applicants/bulk` POST → `manage_events`;
  `access/[id]/decision` POST → `approve_admin_requests` (was `isSuperAdmin`).
- `jobs/[id]/route.ts`: GET is a read — LEFT on `isAdmin()` (import retained);
  only the POST rerun was grant-gated.
- Standard try/catch pattern: `await requireGrant(...)` in a try, `catch { 403 }`.
- Removed now-unused `isAdmin`/`isSuperAdmin` imports from the 6 routes that no
  longer reference them; `rescore-all` keeps importing `estimateJobCents` +
  `isScoringModel` from `@/lib/admin`. Updated the `rescore-all` security comment
  to reference the grant instead of `isAdmin()`.
- Tests: `tests/app/rescore-all.test.ts` now mocks `@/lib/grants` `requireGrant`
  (toggled by `mockAllowed`) AND keeps a `@/lib/admin` importActual mock for
  `estimateJobCents`. `tests/app/admin-access-decision.test.ts` replaced its
  `@/lib/admin` `isSuperAdmin` mock with the `@/lib/grants` `requireGrant`
  mock (`mockAllowed`).

### Potential concerns to address:
- Role-admins with a non-null grant set are now genuinely restricted by these
  routes; once the RolesManager UI (T7) lands, verify each grant maps to the
  intended UI control so operators aren't silently 403'd.

## Progress Update as of 2026-05-26 05:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
RBAC Phase 2a T4 done (/api/admin/roles CRUD routes). Fixed a tsc breakage the
T4 implementer caught: T3's `track()` test helper was typed `(r:{id:string})`,
narrowing away `grants` — made it generic `<T extends {id:string}>(r:T):T`.
tsc clean again.

## Progress Update as of 2026-05-26 04:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
RBAC Phase 2a Task 4 complete (TDD): added the grant-gated `/api/admin/roles` CRUD route handlers (`POST` create; `PATCH`/`DELETE` by id) plus `tests/app/admin-roles-route.test.ts` (4 tests, all passing on two consecutive runs against the live dev Neon DB).

### Detail of changes made:
- `src/app/api/admin/roles/route.ts`: `POST` gated by `create_roles` (403 on failure), validates JSON (400) and required `name` (400 after trim), filters `grants` to strings, calls `createRole`; returns `{ role }` (200) or 409 on duplicate-name insert error. `runtime = "nodejs"`.
- `src/app/api/admin/roles/[id]/route.ts`: `PATCH` and `DELETE` gated by `edit_roles` (403). Next 16 dynamic handler signature `(req, ctx: { params: Promise<{id}> })`; `id` validated via `isUuid` (400). PATCH builds a partial patch (trimmed name, string-filtered grants), returns `{ role }` or 404. DELETE maps `deleteRole` result: `in_use`→409, `not_found`→404, else `{ ok: true }` 200.
- Test mocks only `requireGrant` from `@/lib/grants` (toggled per-grant via `canCreate`/`canEdit`), uses real DB writes with afterEach cleanup.

### Potential concerns to address:
- Pre-existing tsc error in `tests/lib/admin-roles.test.ts:20` (`track(r: { id: string })` narrows away `grants`) — from Task 3, unrelated to Task 4 files; left untouched per task scope. Should be fixed in a follow-up (widen `track`'s generic).

## Progress Update as of 2026-05-26 04:52 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
RBAC Phase 2a Task 3 complete: added `tests/lib/admin-roles.test.ts` covering createRole/updateRole/listRoles, in-use delete block, and getRoleForClerkUser sentinel values. All 3 tests pass on two consecutive runs against the live dev Neon DB.

### Detail of changes made:
- `tests/lib/admin-roles.test.ts`: 3 tests — (1) creates/updates/lists a role, (2) blocks deletion when a clerkUser has the role assigned then allows after unassigning, (3) getRoleForClerkUser returns grants array for roled user, null for role-less approved admin, and null for unknown user. Cleanup via afterEach deletes adminAccess rows before adminRoles rows to respect FK.

### Potential concerns to address:
- Task 4 next: /api/admin/roles CRUD routes need to be TDD'd with similar live-DB approach.

## Progress Update as of 2026-05-26 04:48 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
RBAC Phase 2a Task 2 complete (TDD): added the grants catalog + capability resolver (`src/lib/grants.ts`) and the admin-role DB helpers (`src/lib/admin-roles.ts`), with `tests/lib/grants.test.ts` (6 tests, all passing).

### Detail of changes made:
- `src/lib/grants.ts`: `GRANTS` catalog of 7 grant keys (run_scoring_jobs, create_events, manage_events, delete_events, create_roles, edit_roles, approve_admin_requests) with display labels; `Grant` union type; `getViewerGrants()`, `can(grant)`, and `requireGrant(grant)` (throws 403-shaped error). Resolver tiers: super-admin (hardcoded `SUPER_ADMIN_EMAILS`) → ALL; env-bootstrap admin (`ADMIN_EMAILS`, verified email) → ALL; approved admin with a role → that role's grants (filtered to known keys); approved admin with NO role → ALL (backward-compatible); else none. Only verified emails count.
- `src/lib/admin-roles.ts`: `getRoleForClerkUser(clerkUserId)` returns `{ grants }` (null grants = role-less approved = full admin) or null when no approved row, via a left join of `admin_access` → `admin_roles`. Plus CRUD/util helpers `listRoles`, `getRole`, `createRole`, `updateRole`, `roleAssigneeCount`, `deleteRole` (deleteRole returns "deleted"|"in_use"|"not_found").
- Test mocks `@clerk/nextjs/server` (currentUser) and `@/lib/admin-roles` (getRoleForClerkUser); `grants.ts` imports `getRoleForClerkUser` via the `@/lib/admin-roles` alias so the mock applies. `tsc --noEmit` clean.

### Potential concerns to address:
- The CRUD helpers in `admin-roles.ts` (listRoles/getRole/createRole/updateRole/deleteRole) are not yet covered by tests — Task 3 adds those.
- Resolver makes a DB call (`getRoleForClerkUser`) per `can()` for non-super/non-env viewers; callers that check multiple grants should prefer one `getViewerGrants()` call.


## Progress Update as of 2026-05-26 05:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
RBAC Phase 2a Task 1 complete: added `adminRoles` table and `admin_access.role_id` FK column to `src/db/schema.ts`, generated migration `0014_wide_captain_britain.sql`, and applied it directly to the dev Neon DB (`ep-old-shadow`) via the neon serverless driver.

### Detail of changes made:
- Added `adminRoles` pgTable (`admin_roles`) with columns: id (uuid PK), name (text, unique), scope (text, default "edit_all"), grants (jsonb array, default []), createdAt, updatedAt. Unique index `admin_roles_name_unique` on `name`.
- Added `roleId` column (`role_id uuid REFERENCES admin_roles(id)`) to `adminAccess` table, placed after `decidedByEmail`. Nullable — backward-compatible for pre-role approved admins.
- Removed stale comment "role_id (Phase 2) will FK into admin_roles; omitted here on purpose" from `adminAccess` table.
- Migration file: `drizzle/0014_wide_captain_britain.sql` — CREATE TABLE admin_roles + CREATE UNIQUE INDEX + ALTER TABLE admin_access ADD COLUMN role_id + FK constraint.
- Dev DB applied via direct neon driver SQL (db:push requires TTY); verified `to_regclass('public.admin_roles')` returns non-null.

### Potential concerns to address:
- Migration 0014 is additive (no data changes) — prod apply is safe whenever Phase 2a ships. Prod currently at 0012+0013.
- `scope` column exists but is not enforced yet — Phase 2b concern only.


## Progress Update as of 2026-05-26 04:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Purged dev test fixtures (269→120 evals, dev `ep-old-shadow` only). Resolved the
Admin RBAC Phase 2 open questions in the spec and wrote the **Phase 2a (grants)**
implementation plan: `docs/superpowers/plans/2026-05-26-admin-rbac-phase2a-grants.md`
(8 TDD tasks). NOT YET BUILT — plan only. Pushing branch for parallel work.

### Detail of changes made:
- Phase 2 decisions: build grants-RBAC first (roles + grant picklist + gating);
  scope (theirs/all) deferred to Phase 2b. Scored profiles will be grant-gated,
  not ownership-scoped. Role-in-use deletion is blocked. Role-less approved
  admins stay full admins (backward-compat — no prod data-seed needed).
- Phase 2a plan covers: `admin_roles` table + `admin_access.role_id` (migration
  **0014**), `grants.ts` (`can`/`requireGrant`), `/admin/roles` CRUD,
  role-at-approval on `/admin/access`, grant-gating all admin API routes + UI.

### Potential concerns to address:
- Phase 2a migration **0014** will need a prod apply before that ships (additive).
  (0012 + 0013 already applied to prod.)



### Summary of changes since last update
**"Profiles scored" feature COMPLETE** (plan tasks 1-6). `/admin/profiles` now
lists every scored profile by Source (Web/Bulk/API) with Cost, Charge, and User
(claimer email/Unclaimed); the average cost-to-score is stored in the DB.

### WHERE THE AVERAGE COST LIVES (for the future API endpoint)
- Table **`app_stats`**, row **`key = 'avg_cost_cents'`**, column **`value`**
  (double precision, in **cents**, e.g. `40.27`), plus `updated_at`.
- Read it via **`getAvgCostCents()`** in `src/lib/app-stats.ts` (returns
  `number | null`). It's the mean `cost_total_cents` over all `source='url'`
  evals with a recorded cost.
- Refreshed after **every score write** (`runEval` + `reEvaluate`, best-effort)
  and on each `/admin/profiles` load, so it stays current.

### Detail of changes made:
- `app_stats` table (migration **0013_nifty_rhino**); `app-stats.ts`
  (refreshAvgCostStat/getAvgCostCents); `profiles-scored.ts` (listScoredProfiles:
  source classification + charge from credit_ledger + claimer); page rewrite
  (Source/Cost/Charge/User columns, dropped IP/Location, batched Clerk email).
- Hardened `tests/lib/app-stats.test.ts`: the original assertion compared the
  refresh value to a separately-timed global AVG, which RACED with the
  concurrent profiles-scored test mutating evals on the shared dev DB. Switched
  to a race-free round-trip + sanity assertion (passes 3/3 consecutive combined runs).

### Potential concerns to address:
- **prod migration 0013 (`app_stats`) must be applied to prod before ship** (no
  auto-migrate; operator runs it; additive + safe).

## Progress Update as of 2026-05-26 03:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Profiles-scored Task 5 — rewrote `/admin/profiles` to use `listScoredProfiles` with new columns (Profile/Source/Cost/Charge/User/When + super-admin Score Detail), a batched single Clerk `getUserList` email lookup for claimers (no N+1), and an avg-cost header that refreshes `app_stats` on load. Dropped IP/Location columns.

### Detail of changes made:
- `src/app/(authed)/admin/profiles/page.tsx` now reads `listScoredProfiles(200)` + `refreshAvgCostStat()` (falls back to `getAvgCostCents()`); resolves claimer clerk ids → emails via one `clerk.users.getUserList({ userId, limit })` call (Clerk backend 3.4.11, returns `{ data: User[], totalCount }` — no type adaptation needed). Source rendered as colored pill; unresolved claimers fall back to "claimed", unclaimed show "Unclaimed". `tsc --noEmit` clean; route returns 200.

### Potential concerns to address:
- No automated test (server/Clerk UI); verified via tsc + live 200. Internal nav kept as `<a href>` (pre-existing `<a>`-vs-`<Link>` lint, out of scope).

## Progress Update as of 2026-05-26 03:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Profiles-scored Task 4 — added pure DB helper `listScoredProfiles` (TDD) that lists `source='url'` evals newest-first and per row classifies source (web/bulk/api), resolves cost, billed charge (sum of `score_debit` ledger), and high/medium-confidence claimer.

### Detail of changes made:
- Created `src/lib/profiles-scored.ts` exporting `ScoredProfileSource`, `ScoredProfileRow`, and `listScoredProfiles(limit=200)`. Source rule: `requestIp` set → web; else linked to a `scoring_job_items` row → bulk; else api. Charge = `-deltaCents` summed over `score_debit` ledger rows (0 if none). Claimer = `users.clerkUserId` where `matchConfidence` is high/medium.
- Created `tests/lib/profiles-scored.test.ts` seeding one eval per source plus a charge + a claim, asserting source/cost/charge/claimer; FK-safe cleanup. Passes against live dev Neon DB.

### Potential concerns to address:
- None new. Pure read helper, no schema change.

## Progress Update as of 2026-05-26 04:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Profiles-scored Task 3 — wired `refreshAvgCostStat()` (best-effort) into both `runEval` and `reEvaluate` in `src/lib/eval-pipeline.ts` so `app_stats.avg_cost_cents` stays current after every score write.

### Detail of changes made:
- Added `import { refreshAvgCostStat } from "@/lib/app-stats"` at the top of `eval-pipeline.ts`.
- In `runEval`: inserted `await refreshAvgCostStat().catch(() => {})` just before the final `return rowToResult(row!)`.
- In `reEvaluate`: same line inserted just before its final `return rowToResult(row!)`.
- `pnpm tsc --noEmit` is clean; `grep` confirms 1 import + 2 call sites = 3 matches.

### Potential concerns to address:
- No production concern: the `.catch(() => {})` wrapper ensures a stat-refresh failure never bubbles up to fail a score.

## Progress Update as of 2026-05-26 03:41 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Profiles-scored Task 2 — implemented `src/lib/app-stats.ts` with `refreshAvgCostStat` and `getAvgCostCents` helpers, driven by a failing-then-passing TDD test against the live dev DB.

### Detail of changes made:
- Created `src/lib/app-stats.ts` exporting `AVG_COST_CENTS_KEY`, `refreshAvgCostStat()`, and `getAvgCostCents()`.
- `refreshAvgCostStat` computes `AVG(cost_total_cents)` over `evaluations` rows where `source='url'` and `cost_total_cents IS NOT NULL`, upserts into `app_stats` under key `"avg_cost_cents"`, and returns the value.
- `getAvgCostCents` reads back the stored value from `app_stats`, returning `null` if never computed.
- Created `tests/lib/app-stats.test.ts` verifying: returned value matches a direct AVG query, row is persisted in `app_stats`, and `getAvgCostCents()` returns the same value. Test passes against live dev Neon DB.

### Potential concerns to address:
- Callers in the scoring path should wrap `refreshAvgCostStat()` in `.catch()` so stats failures never block scoring (noted in comments; Task 3 will wire this up).
- Prod `app_stats` table (migration 0013) still needs to be applied before Task 6 ship.

## Progress Update as of 2026-05-26 03:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Profiles-scored Task 1 — added `app_stats` key-value table (migration 0013) and applied it to the dev Neon DB. This table will store computed/cached app metrics, starting with `avg_cost_cents` (mean cost-to-score across real URL-sourced profiles with recorded costs).

### Detail of changes made:
- Added `doublePrecision` to the `drizzle-orm/pg-core` import in `src/db/schema.ts`.
- Appended `appStats` table export to `src/db/schema.ts` (key TEXT PK, value DOUBLE PRECISION, updated_at TIMESTAMPTZ).
- Generated migration `drizzle/0013_nifty_rhino.sql` via `pnpm db:generate` — adds `CREATE TABLE "app_stats"`.
- Applied the table to dev Neon DB (ep-old-shadow) via a throwaway `scripts/_apply_0013.ts` script; confirmed via `to_regclass('public.app_stats')` returning `"app_stats"`.

### Potential concerns to address:
- prod migration 0013 (`app_stats`) must still be applied to prod (ep-fragrant-surf) before the ship of Task 6; no auto-migrate on deploy.

## Progress Update as of 2026-05-26 03:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged origin/main (9 commits: API billing hardening, /api/v1/resolve, NFX-by-handle).
Confirmed NO existing average-cost/stats storage anywhere (18 tables checked).
Wrote the implementation plan for the **"Profiles scored" table + stored average
cost**: `docs/superpowers/plans/2026-05-26-profiles-scored-table.md` (6 TDD tasks).

### Detail of changes made:
- Design approved (user green-lit code directly): per-profile table with
  Source (Web/Bulk/API) · Cost · Charge · User columns (drop IP/Location);
  average cost stored in a new `app_stats` table (`key='avg_cost_cents'`).
- Source classification: request_ip set → Web; linked to scoring_job_items → Bulk;
  else → API. Charge from credit_ledger score_debit ($0 for web/bulk). Claimer
  email via one batched Clerk getUserList.

### Potential concerns to address:
- prod migration **0013** (`app_stats`) must be applied to prod before ship.

## Progress Update as of 2026-05-26 02:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Renamed main's "User scoring requests" page: route `/admin/users` → `/admin/profiles`,
title "User scoring requests" → "Profiles scored".

### Detail of changes made:
- `git mv` page to `src/app/(authed)/admin/profiles/page.tsx`; function
  `AdminUsersPage` → `AdminProfilesPage`; `<h1>` → "Profiles scored".
- Layout nav: `Users` (→/admin/users) → `Profiles` (→/admin/profiles).
- Updated stale `/admin/users` doc comments → `/admin/profiles` across 6 files
  (profile/page, rescore + eval routes, ScoreDetailButton, eval-pipeline,
  schema.ts — comment-only, drift guard clean).
- Note: `/admin/access` (admin approve/deny) is unaffected; `/admin/users` now 404s.

### Potential concerns to address:
- None. tsc clean; /admin/profiles 200, old /admin/users 404.

## Progress Update as of 2026-05-26 02:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added the ability to DELETE (revoke) admin-access rows from `/admin/access` —
e.g. remove a previously-approved admin. Hard delete: the row is removed, the
person loses admin access, and they can request again later.

### Detail of changes made:
- `deleteAdminAccess(id)` helper in `admin-access.ts` (returns bool).
- New `DELETE /api/admin/access/[id]` route (super-admin gated 403, isUuid 400,
  404 unknown) — sibling to the existing `[id]/decision` POST route.
- `AdminAccessTable`: non-pending rows (approved/denied) now show a **Delete**
  button (window.confirm → DELETE → router.refresh) instead of "—". Pending rows
  keep Approve/Deny.
- Tests: helper delete case (admin-access.test.ts) + new
  `tests/app/admin-access-delete.test.ts` (200 deletes, 403 non-super + row
  survives, 400 non-uuid, 404 unknown). tsc clean, all green.

### Potential concerns to address:
- None. Delete is super-admin-gated server-side; UI confirm guards accidental clicks.

## Progress Update as of 2026-05-26 02:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added icons to the two `/admin` hub cards. Introduced `react-icons` (5.6.0) —
the repo had no icon library (inline SVGs only) so this is the first use.

### Detail of changes made:
- `HubCard` gained an `icon: IconType` prop, rendered centered above the title
  in the gold accent (`#dfa43a`, size 40).
- Bulk Score Founders & Investors → `FiBarChart2` (Feather bar chart = scoring).
- Manage Events → `FiCalendar` (Feather calendar).
- Used the Feather (`react-icons/fi`) set (stable export names; verified
  `FiBarChart2`/`FiCalendar` exist in 5.6.0 before importing).

### Potential concerns to address:
- None. (react-icons is tree-shakeable per-icon; only the two used icons ship.)

## Progress Update as of 2026-05-26 01:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed an AdminAccessGate bug: signing into /admin showed the signed-OUT gate
while the client already had a Clerk session, so the "Sign in" button errored
with `cannot_render_single_session_enabled`. Root cause: the gate trusted only
the SERVER-passed `signedIn` (from `currentUser()`), which can be null on a
client/server auth desync (stale dev session or post-modal-signin soft nav).

### Detail of changes made:
- `AdminAccessGate` now uses the CLIENT `useUser()` hook as the source of truth
  for signed-in state (mirrors how `/developers` works). Branches:
  client-signed-out → Sign in; client-signed-in but server-not-synced →
  auto `router.refresh()` once + "Reload" + Sign-out escape hatch; server-synced
  non-admin → Request Admin Status / pending / denied. Never calls `openSignIn`
  while signed in. Email prefers the client `useUser()` email.
- tsc clean, component lints clean.

### Potential concerns to address:
- If a dev Clerk session is genuinely stale, the user must Sign out (now offered
  in the gate) and sign in fresh — server `currentUser()` can't resurrect it.
- If `drodio@storytell.ai`'s email is UNVERIFIED in the Clerk dev instance,
  isAdmin/isSuperAdmin (verified-only) will treat them as a non-admin → gate
  shows "Request Admin Status". Verify the email in Clerk to get super-admin.

## Progress Update as of 2026-05-26 01:15 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
**Admin RBAC Phase 1 COMPLETE** (Tasks 1-9, subagent-driven w/ spec + code-quality
review each). Sign-in-from-/admin (no profile claim), Request Admin Status,
super-admin tier, and super-admin-only `/admin/access` approve/deny are all live
on localhost. 22 RBAC tests pass; tsc clean.

### Detail of changes made:
- `admin_access` table (migration **0012**), DB helpers (`admin-access.ts`),
  `isSuperAdmin` + DB-approved branch in `isAdmin`/`adminGate`.
- `POST /api/admin/access/request` (401 unauth, no-op if already admin) +
  `POST /api/admin/access/[id]/decision` (super-admin gated 403, 400/404 guards).
- `AdminAccessGate` client component (sign-in via `clerk.openSignIn`, Request
  button, pending/denied states) rendered by `admin/layout.tsx` for non-admins
  (replaced `redirect("/")`). Non-admins can NEVER reach admin children (verified).
- `/admin/access` page (super-admin-only) + `AdminAccessTable` (approve/deny).
- **Route decision:** admin-access approval lives at `/admin/access` because main
  already shipped `/admin/users` ("User scoring requests"). Nav: Score · Events ·
  Users · Access(super-admin) · Pending.
- Added 2 extra admin-auth tests (adminGate super-admin path; multi-email
  verified-only filter) → admin-auth 8/8.
- Final holistic review (opus): ship-ready, no critical/important code issues.
  Fixed 2 stale `/admin/users` doc comments → `/admin/access`.

### Potential concerns to address:
- **PROD migration 0012 (admin_access)** must be applied to the prod Neon Primary
  before this ships (no auto-migrate per memory). Additive + safe. Operator runs it.
- **Pre-existing lint debt from main:** ~59 eslint problems across ~18 files
  (mostly `@next/next/no-html-link-for-pages`, plus `react-hooks/static-components`
  in `EventCriteriaBuilder.tsx`). Not from RBAC; main ships with them. Separate
  cleanup pass warranted.
- Run `next build` before ship as the real production gate.

## Progress Update as of 2026-05-26 04:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 8 shipped: `/admin/access` server page (super-admin only) + `AdminAccessTable` client component with Approve/Deny buttons that POST to the decision API and call `router.refresh()`.

### Detail of changes made:
- `src/components/admin/AdminAccessTable.tsx` — new "use client" component; exports `AccessRow` type (serializable: `requestedAt` is ISO string); renders a table of all access rows; pending rows show Approve/Deny buttons; busy-state disables both buttons while a fetch is in-flight; network/HTTP errors surface inline; `StatusPill` sub-component colors: amber=pending, emerald=approved, red=denied.
- `src/app/(authed)/admin/access/page.tsx` — `force-dynamic` server page; `isSuperAdmin()` guard returns `<NotAuthorized email={...}/>` for non-super-admins; `listAdminAccess()` rows serialized (Date → ISO string) before passing to `AdminAccessTable`; `tsc --noEmit` clean.

### Potential concerns to address:
- None new.

## Progress Update as of 2026-05-26 03:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 7 shipped: admin layout now renders `AdminAccessGate` for non-admins (signed-out or lacking access) instead of redirecting home; super-admin-only `Access` nav link added pointing to `/admin/access`.

### Detail of changes made:
- `src/app/(authed)/admin/layout.tsx` — replaced `redirect("/")` with `AdminAccessGate` render for non-admins; imports `currentUser`, `getAdminAccessStatus`, `isSuperAdmin`, `AdminAccessGate`; added conditional `<a href="/admin/access">` nav link visible to super-admins only; `gateStatus` collapses `approved` → `none` (approved users pass the `admin` check and never reach the gate).

### Potential concerns to address:
- None new.

## Progress Update as of 2026-05-26 02:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 6 shipped: `AdminAccessGate` client component — shows a Clerk sign-in button for signed-out visitors and a "Request Admin Status" button (with pending/denied state) for signed-in non-admins.

### Detail of changes made:
- `src/components/admin/AdminAccessGate.tsx` — new "use client" component; accepts `signedIn`, `email`, `status` props; uses `useClerk().openSignIn` mirroring DeveloperConsole; POSTs to `/api/admin/access/request` with optimistic local-status update; gold accent colors (`#dfa43a`/`#c98e2a`) consistent with the rest of the app.

### Potential concerns to address:
- None new.

This branch ships the event-vetting platform layer (P1) per the design
in `docs/superpowers/specs/2026-05-22-stakeholder-revision-design.md`
and plan `docs/superpowers/plans/2026-05-22-events-v1-p1.md`.

## Progress Update as of 2026-05-26 01:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Follow-up fix to Task 5 decision route: `decidedByEmail` now falls back to `emailAddresses[0]` when `primaryEmailAddress` is null, matching the pattern used in sibling admin routes.

### Detail of changes made:
- `src/app/api/admin/access/[id]/decision/route.ts` — replaced single-field `primaryEmailAddress` derivation with a two-level fallback (`primaryEmailAddress ?? emailAddresses[0]`) before `.toLowerCase()`, preventing silent null in Clerk server contexts where `primaryEmailAddress` can be null even with verified emails.

### Potential concerns to address:
- None new.

## Progress Update as of 2026-05-26 12:57 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 5 shipped: `POST /api/admin/access/[id]/decision` route (super-admin gated) + 6 TDD tests (approve, deny, 403 non-super-admin with no mutation, 400 invalid decision, 400 non-uuid id, 404 unknown id).

### Detail of changes made:
- `src/app/api/admin/access/[id]/decision/route.ts` — new route; super-admin gate checked first; delegates to `decideAdminAccess()` from `admin-access.ts`; records `decidedByEmail` from Clerk `currentUser`.
- `tests/app/admin-access-decision.test.ts` — 6 tests against live dev Neon DB; Clerk and `@/lib/admin` mocked; cleanup via `afterEach`.

### Potential concerns to address:
- None new; prior BLOCKS concern (Tasks 6-9 ordering) still applies for remaining tasks.

## Progress Update as of 2026-05-26 12:53 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 4 shipped: `POST /api/admin/access/request` route + 3 TDD tests (pending insert, 401 unauthenticated, approved no-op for existing admins).

### Detail of changes made:
- `src/app/api/admin/access/request/route.ts` — new route; delegates to `requestAdminAccess()` from `admin-access.ts`; short-circuits with `{ status: "approved" }` for callers already passing `isAdmin()`.
- `tests/app/admin-access-request.test.ts` — 3 tests against live dev Neon DB; Clerk and `@/lib/admin` mocked.

### Potential concerns to address:
- None new; prior BLOCKS concern (Tasks 4-9 ordering) still applies for remaining tasks.

## Progress Update as of 2026-05-26 11:40 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged origin/main (34 commits: billing/Stripe credits, NFX direct scraper +
SEC EDGAR investor/founder signals **wired into scoring**, low-signal gate,
and — importantly — main's own `/admin/users` "User scoring requests" page +
its own `isSuperAdmin`). Resolved conflicts.

### Detail of changes made:
- **admin.ts dedupe:** the merge left TWO `isSuperAdmin`/`superAdminEmails`
  (mine hardcoded `SUPER_ADMIN_EMAILS`, main's env-based `SUPERADMIN_EMAILS`).
  Kept the **hardcoded** version (matches the "PR-to-change" requirement; it's a
  superset of main's `drodio@storytell.ai` default, so main's `/admin/users`
  "Score Detail" debug gate still works). The `SUPERADMIN_EMAILS` env var is now
  ignored.
- **Migration collision:** both branches grabbed 0009. Took main's journal/
  snapshots canonical, removed my `0009_green_leopardon.sql`, regenerated
  admin_access as **`0012_fluffy_donald_blake.sql`** (dev DB already has the
  table from Task 1). tsc clean.
- **Layout nav:** reconciled to events-v1's hub structure (Score / Events) +
  main's `/admin/users` (Users) + Pending. Dropped obsolete `/admin/jobs/new`.

### Potential concerns to address (BLOCKS RBAC Tasks 4-9):
- **`/admin/users` route is now TAKEN by main** for "User scoring requests"
  (different feature). The RBAC plan wanted `/admin/users` for admin-access
  approve/deny. Needs an IA decision (rename one, or move admin-access approval
  to e.g. `/admin/access`) before Task 8 / layout Task 7 proceed.
- prod migration: `0012` (admin_access) must be applied to PROD Neon before ship.



### Summary of changes since last update
Admin RBAC Phase 1 Task 3 — extended `src/lib/admin.ts` with `isSuperAdmin`, `SUPER_ADMIN_EMAILS`, and DB-approval branch in `isAdmin`/`adminGate`. TDD: 6 tests written first (confirmed fail), then implementation (all 6 pass), `tsc --noEmit` clean.

### Detail of changes made:
- Added `import { isApprovedAdmin } from "@/lib/admin-access"` to `admin.ts`.
- Added `SUPER_ADMIN_EMAILS` constant (hardcoded, NOT env) and `superAdminEmails()` helper.
- Exported `isSuperAdmin()`: calls `currentUser().catch(() => null)`, checks verified emails against `superAdminEmails()`.
- Replaced `isAdmin()` body: super-admin check first, then env allowlist (`ADMIN_EMAILS`), then `isApprovedAdmin(user.id)` DB check.
- Replaced `adminGate()` body: adds `.catch(() => null)` to `currentUser()`, applies all three tiers, returns `{ok:true}` or `{ok:false, email}`.
- Left `requireAdmin()`, all cost-estimate exports, `adminEmails()`, `verifiedEmails()` unchanged.
- Created `tests/lib/admin-auth.test.ts` with 6 unit tests using vitest mocks for Clerk + `isApprovedAdmin`.

### Potential concerns to address:
- `adminGate()` now calls `isApprovedAdmin` (a DB hit) on every non-super-admin page load. Consider caching if hot paths emerge.
- `requireAdmin()` delegates to `isAdmin()` which makes 1–2 async calls; acceptable for API routes.

Forked from `polish` at commit `0765e9f` ("events-v1: docs reflect operator decisions").

## Progress Update as of 2026-05-26 10:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admin RBAC Phase 1 Task 2 — created `src/lib/admin-access.ts` DB helper module with TDD (5 tests, all passing against live dev Neon DB).

### Detail of changes made:
- Created `src/lib/admin-access.ts` exporting: `getAdminAccessStatus`, `isApprovedAdmin`, `requestAdminAccess`, `listAdminAccess`, `decideAdminAccess` plus types `AdminAccessStatus` and `AdminAccessRow`.
- `requestAdminAccess` handles three cases: insert new pending row, no-op if already pending/approved, flip denied → pending with decision fields cleared.
- `listAdminAccess` orders pending rows first, then by most-recently-requested (used by /admin/users page in Task 8).
- `decideAdminAccess` updates status + decidedAt + decidedByEmail, returns the updated row or null if id unknown.
- Created `tests/lib/admin-access.test.ts` with 5 tests using random `clerkUserId` per test + `afterEach` cleanup against live dev DB.

### Potential concerns to address:
- `listAdminAccess` not covered by this task's tests — exercised indirectly in later tasks.
- All helpers are pure DB logic with no auth checks; auth enforcement belongs at the API route layer (Tasks 4 & 5).

## Progress Update as of 2026-05-26 11:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admin RBAC Phase 1 — added `admin_access` table (migration 0009), pushed to dev DB.

### Detail of changes made:
- Added `adminAccess` table to `src/db/schema.ts` with fields: `id`, `clerkUserId`, `email`, `name`, `imageUrl`, `status` (default "pending"), `requestedAt`, `decidedAt`, `decidedByEmail`. Unique index on `clerk_user_id`.
- Generated migration `drizzle/0009_green_leopardon.sql` via `pnpm db:generate` — creates `admin_access` table + unique index.
- Applied migration to dev Neon DB (`ep-old-shadow`) using `@neondatabase/serverless` directly (drizzle-kit push requires TTY for the "is this a rename?" resolver prompt; used SQL directly instead). Confirmed table exists via `to_regclass('public.admin_access')` → `"admin_access"`.

### Potential concerns to address:
- `db:push` is not usable headless (requires TTY for rename-detection prompts even with `--force`). Future pushes for new tables should use the same direct-SQL approach, or run interactively in a terminal.
- Migration 0009 must be applied to PROD Neon Primary before merging to prod (no auto-migrate per memory note) — purely additive, safe to run any time.

## Progress Update as of 2026-05-26 10:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added `drodio@storytell.ai` to the super-admin set (so the operator's festival
login has super-admin locally + prod). Wrote the **Admin RBAC Phase 1**
implementation plan (`docs/superpowers/plans/2026-05-26-admin-rbac-phase1.md`),
9 TDD tasks. Ready to execute Phase 1.

### Detail of changes made:
- Spec `SUPER_ADMIN_EMAILS` now `["drodio@chief.bot","drodio@gmail.com","drodio@storytell.ai"]`.
- Phase 1 plan covers: `admin_access` table (migration 0009) + DB helpers,
  super-admin tier + DB-approved in `isAdmin`/`adminGate`, `/api/admin/access/request`,
  `/api/admin/access/[id]/decision` (super-admin gated), `AdminAccessGate`,
  layout rewire (gate instead of redirect + super-admin Users nav), `/admin/users`
  page. Tests run against the shared dev Neon DB (random clerk ids, cleaned up).

### Potential concerns to address:
- `admin_access` (migration 0009) must be applied to PROD Neon Primary before
  ship (no auto-migrate per memory) — additive + safe; operator runs it.

## Progress Update as of 2026-05-26 10:10 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged origin/main (36 commits incl. the `/developers` self-serve API-key
console + sign-in pattern, founder-score API, migration 0008 — clean, no
conflicts). Restyled the `/admin` hub boxes. Brainstormed + wrote the approved
design spec for **Admin RBAC** (`docs/superpowers/specs/2026-05-26-admin-rbac-design.md`).
No RBAC code yet — next step is the writing-plans skill for **Phase 1**.

### Detail of changes made:
- `/admin` hub boxes: centered (`max-w-4xl mx-auto`), taller (`min-h-[26rem]`),
  content vertically+horizontally centered, 40px padding (`p-10`), gold Enter
  buttons (`#dfa43a`, matches `/developers`).
- Admin RBAC design approved. Key decisions captured in the spec:
  - 3 tiers: super-admin (hardcoded `["drodio@chief.bot","drodio@gmail.com"]`,
    PR to change) > admin (DB `admin_access`, approved via `/admin/users`) >
    everyone else. Existing `ADMIN_EMAILS` env retained as bootstrap full-admins.
  - Grant-gated pages; role assigned at approval; scope (view/edit theirs/all)
    spans events + scoring jobs + scored profiles.
  - Phased: **Phase 1** = sign-in-from-/admin (no claim) + Request Admin Status +
    super-admin concept + `/admin/users` approve/deny (approved = full admin).
    **Phase 2** = `/admin/roles` CRUD + grants + scopes + grant-gating.

### Potential concerns to address:
- Scope attribution for "scored profiles" is the fuzzy bit (evaluations are
  generated via jobs/public/API) — deferred to Phase-2 planning (Open Questions
  in the spec).
- To test super-admin locally the operator must sign in as `drodio@gmail.com`
  (festival login is `drodio@storytell.ai`, which stays a bootstrap admin).

## Progress Update as of 2026-05-26 09:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Restructured `/admin` into a two-box hub (landing) page. The old dashboard
content (Spend totals, scoring-jobs table, Re-Run All, New job) moved intact to
a new `/admin/score` route. Box 1 "Bulk Score Founders & Investors" → `/admin/score`;
Box 2 "Manage Events" → `/admin/events`.

### Detail of changes made:
- Renamed page-route subtree `/admin/jobs/*` → `/admin/score/*` (page URLs only;
  the backend API endpoints stay at `/api/admin/jobs` — internal, invisible to
  users, renaming adds risk for no benefit). Moved `jobs/new` → `score/new` and
  `jobs/[id]` → `score/[id]` via `git mv`.
- `/admin/page.tsx` rewritten as a pure hub (two `<HubCard>`s, adminGate-guarded).
- `/admin/score/page.tsx` is the relocated dashboard: heading changed
  "Scoring jobs" → "Score Founders & Investors"; button "+ New job" →
  "+ New Bulk Scoring Job"; internal links + `← Admin home` back-link updated.
- Updated three `router.push` page navigations to `/admin/score/...` in
  NewJobForm, RerunButton, RescoreAllButton (left their `/api/admin/jobs`
  fetches untouched).
- Header nav (`admin/layout.tsx`): "Jobs / New job" → "Score / Events".
- Fixed three stale doc comments (schema.ts, eval-pipeline.ts ×2) to `/admin/score`.

### Potential concerns to address:
- API routes still live at `/api/admin/jobs` while pages are `/admin/score` — a
  deliberate split, but worth noting for anyone tracing the flow.

## Progress Update as of 2026-05-26 06:13 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Shipping prep: merged origin/main once more (PR #53: score-table sort, Re-Score
disambig, splash re-crop — no schema). Clean, no conflicts, no drift, tsc clean.
**Confirmed PRODUCTION Neon (Primary branch, `neondb`) is already fully migrated**
for events: all 4 event tables present + `evaluations.investor_stage_focus` =
true + `bypass_codes.event_id` = true (verified via read-only introspection in
the Neon console). So the events `0007` schema delta is already on prod — the
critical "investor_stage_focus written on every eval" crash risk is NOT present.
Clear to merge events-v1 → main (Vercel auto-deploys).

### Detail of changes made:
- The raw `0007_quick_sway.sql` errored with "event_applicants already exists"
  when run against prod — because prod already had the full events schema from
  an earlier application. Not a problem; introspection confirmed completeness.
- No migration needed at deploy time.

### Potential concerns to address:
- Index/FK completeness on prod was not exhaustively re-verified (only
  table+column existence). Highly likely complete (prod's tables came from a
  full prior 0007 apply). Worth a one-time check of `events_slug_unique` +
  `event_applicants_event_linkedin_unique` before events go live with real
  applicants — missing unique indexes would weaken dedup but won't crash.

## Progress Update as of 2026-05-26 06:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Re-merged `origin/main` (9 commits: splash polish, delete-my-profile identity
nuke, stale-Clerk-session tolerance, Re-Score button relocate — PRs #48–51).
Clean auto-merge, no conflicts, no migration churn. `isAdmin()` gained main's
`currentUser().catch(() => null)` stale-session guard; the `verifiedEmails`
helper coexists. tsc clean; rescore-all 3/3 in isolation. Prep for shipping
events-v1 to production.

### Detail of changes made:
- No code changes of ours; `admin.ts` + `profile/page.tsx` auto-merged.
- Migration delta vs `main` is still exactly `0007_quick_sway.sql` (the 4 event
  tables + `evaluations.investor_stage_focus` + `bypass_codes.event_id`).

### Potential concerns to address:
- **Ship-blocker (sequencing):** prod Neon must have `0007` applied BEFORE the
  code deploys — `investor_stage_focus` is written on every eval, so deploying
  the code first would crash live scoring. Migration is additive, so applying it
  to prod first is safe. Plan: pull prod env via Vercel, apply additive SQL to
  prod, verify, then merge PR #24 → main (Vercel auto-deploys).
- Minor: `adminGate()` doesn't yet wrap `currentUser()` in `.catch` like
  `isAdmin()` now does — a stale session would error the admin page instead of
  rendering NotAuthorized. Non-blocking; harden later.

## Progress Update as of 2026-05-26 05:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 3: wired RescoreAllButton into the admin jobs table. The table now always
renders (empty-state moved into the tbody) so the "Re-Run All" control in the
trailing header cell shows even with zero jobs. Server-side: count of source=url
profiles + per-model tuned estimate (getEstimateCents) passed to the component.

### Detail of changes made:
- `src/app/(authed)/admin/page.tsx`: added evaluations/count/eq/getEstimateCents/
  RescoreAllButton imports; fetch profileCount + sonnetCents + opusCents in the
  Promise.all; restructured the jobs table to always render with RescoreAllButton
  in the last <th>.

### Potential concerns to address:
- None.

## Progress Update as of 2026-05-26 05:33 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Code-quality review of Task 2 (RescoreAllButton) flagged one Minor cosmetic
nit: the confirm dialog rendered the model name lowercase ("with sonnet").
Capitalized it to "Sonnet"/"Opus" via a `modelLabel`. (Spec + quality reviews
of Tasks 1 & 2 both passed; Task 3 wiring is next.)

### Detail of changes made:
- `src/components/admin/RescoreAllButton.tsx`: derive `modelLabel` and use it in
  the `window.confirm` copy.

### Potential concerns to address:
- None.

## Progress Update as of 2026-05-26 09:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Task 2: created `src/components/admin/RescoreAllButton.tsx` — a `"use client"` component with a Sonnet/Opus model picker `<select>` and a "Re-Run All" button that confirms with a tuned cost estimate, calls `POST /api/admin/rescore-all`, and redirects to the new job page on success.

### Detail of changes made:
- Created `src/components/admin/RescoreAllButton.tsx`: accepts `count` (profile count) and `centsPerProfile` (per-model cost map). On click: guards zero count, shows `window.confirm` with USD estimate, POSTs `{ model }` to `/api/admin/rescore-all`, redirects to `/admin/jobs/:jobId` on success, alerts on error. Mirrors `RerunButton.tsx` style.
- No unit test created — matches codebase convention (`RerunButton` has none; Vitest runs in node env; component will be verified manually in Task 3 when wired into `admin/page.tsx`).

### Potential concerns to address:
- None introduced. Task 3 will wire this component into `admin/page.tsx` with the necessary server-side data fetches.

## Progress Update as of 2026-05-26 05:25 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented Task 1 (TDD): wrote `tests/app/rescore-all.test.ts` (3 tests), confirmed failure, then created `src/app/api/admin/rescore-all/route.ts`. All 3 tests pass; typecheck is clean.

### Detail of changes made:
- Created `src/app/api/admin/rescore-all/route.ts`: admin-gated POST endpoint that queries all `source="url"` evaluations, inserts a `queued` scoring job, and batch-inserts one `resolved` job item per evaluation (carrying `evaluationId` so the cron worker calls `reEvaluate` not `runEval`). Inserts chunked at 200 rows to stay under neon-http param limits.
- Created `tests/app/rescore-all.test.ts`: 3 integration tests — happy path (job + items created, cascade cleanup), 403 on non-admin, 400 on invalid model. `isAdmin` and `estimateJobCents` mocked; `isScoringModel` real via `importActual`.

### Potential concerns to address:
- None introduced by this task. Pre-existing: admin email check relies on Clerk verified-email flag; test DB must always have `source="url"` evaluations (handled by suite-shared setup).

## Progress Update as of 2026-05-26 05:21 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
User approved the rescore-all spec. Wrote the implementation plan:
`docs/superpowers/plans/2026-05-26-rescore-all.md` (3 tasks, TDD, complete code).
Ready to execute.

### Detail of changes made:
- Task 1: `POST /api/admin/rescore-all` (isAdmin-gated; creates a queued job +
  one `resolved` item per `source="url"` eval carrying `evaluationId`) + 3
  integration tests (happy path with cascade cleanup, 403 non-admin, 400 bad
  model). Mirrors the existing `POST /api/admin/jobs` creation pattern exactly.
- Task 2: `RescoreAllButton` client component (Sonnet/Opus `<select>` + "Re-Run
  All", confirm() with tuned cost, redirect to job page). No unit test —
  matches codebase convention (node-env Vitest; `RerunButton` has none);
  manual verification in Task 3.
- Task 3: wire into `admin/page.tsx` — fetch `count()` of url evals +
  `getEstimateCents` per model; **always render the jobs table** (empty-state
  moved into tbody) so the Re-Run All control in the trailing `<th>` shows even
  with zero jobs.
- Self-review noted the one deliberate spec deviation: the 0-eligible
  *integration* test is omitted (suite-shared DB always has url evals); behavior
  is implemented + UI-guarded.

### Potential concerns to address:
- None new.

## Progress Update as of 2026-05-26 05:12 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Brainstormed + wrote the design spec for a **bulk "Re-score all profiles"**
feature: `docs/superpowers/specs/2026-05-26-rescore-all-design.md`. Awaiting
user review of the spec before writing the implementation plan.

### Detail of changes made:
- Design: a "re-score all" is just a **scoring job populated with every
  `source="url"` profile** (one item per eval, carrying `evaluationId`). The
  existing cron worker already calls `reEvaluate` for items with an
  `evaluationId`, so the bulk run reuses the exact per-profile scoring mechanism
  — no duplication. Operator decisions baked in: model chosen at click time
  (Sonnet/Opus); control labeled **"Re-Run All"** placed in the **jobs table
  `<thead>`** (last column, above the per-row Re-run buttons), not next to
  "+ New job".
- Security requirement captured: every spend endpoint is verified-admin gated
  server-side. Audit confirms `POST /api/admin/jobs`, `POST /api/admin/jobs/[id]`,
  and `POST /api/rescore` already gate via `isAdmin()` (verified-emails-only
  post #46) / owner-or-admin; the new `POST /api/admin/rescore-all` copies that.

### Potential concerns to address:
- None new. Spec self-review passed (no placeholders, consistent, single-scope).

## Progress Update as of 2026-05-26 05:02 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` (31 commits, PR #25 `founder-signals` — the big scoring
upgrade: Exa grounding layer, double-verification of high-value rows, prompt
caching the static rubric through the AI Gateway, new live-scoreboard scoring
screen, `/account` settings page, NFX JWT-expiry email alert). Only
`package.json` + `pnpm-lock.yaml` conflicted (resend `6.12.3`→`6.12.4`); the
heavily-edited scoring files (`scoring.ts`, `eval-pipeline.ts`, `profile/page.tsx`,
`scoring.test.ts`) auto-merged cleanly. 195/195 tests green, tsc clean, no
migration drift.

### Detail of changes made:
- **Conflicts:** `package.json` resend pin → `^6.12.4` (main's); `pnpm-lock.yaml`
  → took main's and ran `pnpm install` to reconcile.
- **Verified the auto-merge held:** `investorStageFocus` survived in both
  `scoring.ts` (rubric prose + schema) and `eval-pipeline.ts`
  (`payloadToWriteFields` both branches). Individual-run scoring entry points are
  still `runEval` / `reEvaluate` in `eval-pipeline.ts` — important because the
  planned bulk "re-score all profiles" batch job will reuse `reEvaluate` (the
  per-profile mechanism) rather than duplicate scoring logic.
- No new migrations from main; `drizzle-kit generate` reports "No schema
  changes." Our events migration is still `0007_quick_sway`.

### Potential concerns to address:
- founder-signals significantly changed what `reEvaluate` does internally (Exa
  grounding + double-verification → more Exa/Claude calls per eval). The
  per-profile cost is now higher and more variable; the bulk re-score cost
  estimate should lean on the tuned `getEstimateCents()` (median of recent
  actuals) rather than the flat constants.

## Progress Update as of 2026-05-26 04:06 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` (4 commits, PR #46 security-hardening: cron prod-auth,
prompt-injection nonce, GitHub identity match, gated money-spend endpoints,
verified-admin). Git auto-merged with **no textual conflicts**, but there was a
**semantic conflict** that had to be fixed by hand (see below). 178/178 tests
green (main added 13 security tests), tsc clean.

### Detail of changes made:
- **Semantic-conflict fix (security-relevant):** PR #46 hardened `isAdmin()` to
  only count **verified** emails (an unverified email is attacker-controllable).
  My `adminGate()` (added in the prior commit, which now gates the admin PAGES)
  was auto-merged WITHOUT that filter — so it would have granted page access on
  an unverified admin-listed email, silently re-opening the exact hole PR #46
  closed. Fixed by extracting a shared `verifiedEmails(user)` helper in
  `src/lib/admin.ts` and using it in BOTH `isAdmin()` and `adminGate()` so they
  can't diverge again. The email shown in `<NotAuthorized/>` is display-only
  (primary email, verified or not) and is never used for the auth decision.
- Everything else auto-merged cleanly: `scoring-tick/route.ts` (events auto-rule
  + main's `isAuthorizedCron` prod-secret check coexist), `scoring.ts` /
  `scoring.test.ts` (prompt-injection nonce).

### Potential concerns to address:
- Clean auto-merges can hide semantic conflicts when two branches add NEW code
  that overlaps in intent (here: a second admin-check path). Worth scanning for
  duplicated auth/security logic on future merges rather than trusting a
  zero-conflict merge.

## Progress Update as of 2026-05-26 03:53 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` again (2 commits, PR #45 "delete-profile-red-link").
Clean merge — no conflicts, no migration churn. Only `src/app/globals.css`
(red styling for the "Delete my profile" UserButton action) + main's PRD.
No impact on events code.

### Potential concerns to address:
- None. Pure UI tweak from main.

## Progress Update as of 2026-05-26 03:49 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two post-merge follow-ups the operator approved: (1) re-wired the events
`AppliedBanner` onto the profile page (the welcome→profile redirect rewrite
had orphaned it), and (2) added a friendly `<NotAuthorized/>` page for
non-admins and applied an admin gate to **all** admin pages — which also
closed a pre-existing security gap (5 of 8 admin pages had no auth check).
tsc clean, 165/165 tests green.

### Detail of changes made:
- **AppliedBanner re-wire** (`src/app/(authed)/profile/page.tsx`): the apply
  flow redirects success to `/welcome?...&applied=<slug>`; main's `/welcome`
  now forwards (preserving `applied=`) to the canonical profile URL. Added
  `applied?: string` to the page's searchParams, an event-title lookup by slug
  (mirrors `not-this-round`), and render `<AppliedBanner>` next to
  `<ClaimSuccessBanner>`. Both vanity dynamic routes (`[handle]`,
  `[handle]/[slug]`) already spread `...searchParams` into this page, so this
  single edit covers all three entry points. Also preserved `applied=` through
  the low-signal `/not-this-round` redirect.
- **Admin gate** (`src/lib/admin.ts` + `src/components/admin/NotAuthorized.tsx`):
  new `adminGate()` (single `currentUser()` call; returns the viewer's email on
  the not-ok path) + a themed `<NotAuthorized email={…}/>` component. Replaced
  `await requireAdmin()` (which threw a raw 403) in the 3 events admin pages,
  and **added** the gate to the 5 previously-unguarded admin pages: `/admin`,
  `/admin/spend`, `/admin/pending`, `/admin/jobs/new`, `/admin/jobs/[id]`.
  `requireAdmin()` is retained for the API routes (they still 403 correctly).

### Potential concerns to address:
- The 5 newly-gated admin pages were previously reachable by any signed-in
  user (only the events pages were guarded). This was a real authz gap; now
  closed. Worth a sanity check that no legitimate non-admin flow depended on
  reaching those (none expected — they're operator tools).
- `AppliedBanner` resolved-but-orphaned concern from the prior entry is now
  resolved.

## Progress Update as of 2026-05-26 03:42 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Re-merged `origin/main` (6 more commits landed minutes after the prior merge:
the `/account/setup` per-channel-prefs redesign + polish, PRs #42–44). Only
the drizzle meta collided — `schema.ts` auto-merged (it gained main's
`pref{Email,Text}*` per-channel columns alongside our events stuff). Same
renumber dance: main's new migration `0006_nasty_mauler` is canonical, so our
events migration was regenerated again as **`0007_quick_sway.sql`** (additive).
165/165 tests green, `tsc` clean.

### Detail of changes made:
- Dropped `0006_rich_frank_castle.sql`; took main's `_journal.json` +
  `0006_snapshot.json`; regenerated events tables as `0007_quick_sway.sql`
  (CREATE the 4 event_* tables + ADD `evaluations.investor_stage_focus` +
  `bypass_codes.event_id`; no DROPs).
- No code conflicts this round — only migration metadata.

### Potential concerns to address:
- The events migration filename now churns on every main merge (0003→0006→0007)
  because drizzle numbers sequentially and main keeps shipping migrations. This
  is cosmetic (content is stable, additive) but means the events migration will
  keep getting a new number until events-v1 merges to main. Harmless.

## Progress Update as of 2026-05-26 03:20 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` into `events-v1` again to close a fresh 43-commit drift
(delete-my-profile, auto-claim-on-signin, the actual-costs-dashboard merge,
plus a stack of badge/leaderboard polish). Resolved 6 conflicts; full suite
now 165/165 green and `tsc` clean. Same migration-renumber pattern as the
prior merge: both sides had grabbed `0003`, so main's history is canonical
and the events tables were regenerated as a new migration.

### Detail of changes made:
- **Migration collision (again):** events-v1 had `0003_dizzy_invaders` (the 4
  event tables); main had shipped `0003_hard_hydra` → `0004_right_chronomancer`
  → `0005_sturdy_hydra` (badge_overrides table, `evaluations.slug`/`slug_kind`,
  `users.clerk_username`, and the `evaluations.cost_*_cents` columns). Took
  main's history as canonical, `git rm`'d `0003_dizzy_invaders.sql`, and
  regenerated the events tables as **`0006_rich_frank_castle.sql`** via
  `drizzle-kit generate` — purely additive (CREATE the 4 event_* tables + ADD
  `evaluations.investor_stage_focus` + `bypass_codes.event_id` + FKs, no DROPs).
- **`schema.ts`:** clean union on the `evaluations` table — kept events-v1's
  `investorStageFocus` AND main's `costLlmCents`/`costExaCents`/`costTotalCents`.
- **`admin/page.tsx`:** unioned — kept main's `<SpendSection>` (cost dashboard)
  AND events-v1's "Events →" nav link, under main's `gap-8` layout.
- **`scoring-tick/route.ts`:** import union — kept the events imports
  (`eventsTable`, `eventApplicants`, `evaluateCriteria`, `transitionApplicant`,
  `Criteria`, `Stage`); dropped `COST_PER_EVAL_CENTS`/`HANDLE_RESOLVE_CENTS`
  because the merged body took main's version that no longer references them.
- **`welcome/page.tsx`:** took main's version wholesale. Main rewrote `/welcome`
  into a thin redirect to the canonical vanity profile URL (`/profile/...`,
  fallback `/profile?e=<uuid>`), preserving query params including `applied=`.
  The old full welcome body (where the events `AppliedBanner` was rendered) is
  gone. See concern below.
- **DB already in sync:** the shared Neon DB already has main's columns
  (`cost_total_cents`, `slug`, `slug_kind`, `badge_overrides`) AND
  `investor_stage_focus` — `0006` is documentation/history; no `db:push` was
  needed locally.

### Potential concerns to address:
- **`AppliedBanner` success path is now orphaned.** The apply flow redirects
  success to `/welcome?...&applied=<slug>`, but main turned `/welcome` into a
  redirect to `/profile/...`. The `applied=` param flows through, but the
  profile page does **not** render `AppliedBanner` (it's now only wired into
  `not-this-round`). Net effect: an approved/scored applicant no longer sees the
  gold "Application received" confirmation on the success path. Needs re-wiring
  onto the profile page (`src/app/(authed)/profile/[handle]/[slug]/page.tsx`
  and the `?e=` fallback) — deferred pending operator decision.
- **Intermittent Neon `fetch failed`.** Server components occasionally throw
  "Error connecting to database: TypeError: fetch failed" on cold connections
  (reproduced 1-in-4 on a simple introspection query; a retry/refresh clears
  it). This is the cause of the admin-event-page error seen during testing —
  not an auth or schema problem. Consider a small retry wrapper around the
  neon-http client if it proves disruptive.

## Progress Update as of 2026-05-25 11:17 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` into `events-v1` to close a 60-commit drift gap (all
the score-items, avatars, admin-pending, AI-SDK-rescore, and Clerk-hardening
work that shipped while this branch sat). Resolved 7 conflicts; regenerated
the migration history; all 119 tests pass. Done in an isolated worktree
(`.worktrees/events-v1`) so it never touched the main checkout.

### Detail of changes made:
- **Code conflicts (all clean unions):** `scoring.ts`, `eval-pipeline.ts`,
  `scoring.test.ts` — kept events-v1's `investorStageFocus` AND main's
  `extractedMetrics`/`summary*` fields + `sanitizeForJsonb()` wrapping.
  `welcome/page.tsx` — unioned the imports (main's `scoreItems`/`asc`/`desc`/
  `inArray`/`sql` + events-v1's `events as eventsTable`). `ClaimProfileModal.tsx`
  — took main's preventive `clerk.signOut()` cleanup (events-v1 predated it).
- **Migration divergence resolved:** both branches had created a different
  `0001` after the shared `0000` (events-v1 `0001_complex_blacklash` vs main
  `0001_furry_ulik` + `0002_bumpy_screwball`). Made main's history canonical,
  dropped events-v1's `0001`, and **regenerated the events tables as
  `0003_dizzy_invaders.sql`** (additive only: CREATE the 4 event_* tables +
  ADD `evaluations.investor_stage_focus` + `bypass_codes.event_id` + FKs).
  `drizzle-kit generate` now reports "No schema changes" — schema is in sync.
- **Test fix:** `scoring-schema.test.ts` fixtures now include the
  now-required `extractedMetrics` object (they predated that field on main).
- `PRD/polish.md` conflict resolved to main's version (it's main's log).

### Potential concerns to address:
- `0003_dizzy_invaders.sql` is generated but **not yet applied to any DB**.
  It must run against the Neon branches before deploy, or reads of the new
  tables/columns will crash (the schema-drift guard exists for exactly this).
- tsc shows 3 `LayoutProps` errors in the worktree only — environmental
  (Next 16 typegen needs a build; `.next/types` absent in a fresh worktree).
  They resolve on build; not present on the main checkout or in CI.

## Progress Update as of 2026-05-22 06:22 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Operator reported `?claim_mismatch=1` on production LinkedIn auth even
when claiming their own profile. Root cause: Clerk returns LinkedIn's
firstName as the user's display brand (e.g. `firstName="DROdio"`) and
sometimes packs the formal name into lastName (`"- Daniel R. Odio"`),
so the matcher's strict first/last token equality failed against
`profile.fullName = "Daniel Odio"`. Loosened the LinkedIn name match
to a surname-must-equal + at-least-one-other-token-shared rule. Both
extra tokens on either side (handle, middle name, suffix) are
tolerated; single-token names still require exact equality. Will
cherry-pick to `polish`/`main` for prod.

### Detail of changes made:
- `src/lib/identity-match.ts`:
  - New `nameTokenList()` helper: strips diacritics/punctuation,
    lowercases, drops single-char tokens (initials).
  - New `linkedinNameMatch(claimName, profileName)`: requires
    matching surname (last token) + at least one other token in
    common. Single-token names fall back to exact equality.
  - LinkedIn branch in `matchConfidence` now calls
    `linkedinNameMatch` instead of strict first+last equality.
- `tests/lib/identity-match.test.ts`: added the "handle in firstName +
  decoration in lastName" case (real DROdio production scenario) and a
  "same surname only" negative case (John Smith vs Jane Smith).


*(Most recent updates at top)*

### Summary of changes since last update
Task 13 — bulk transition endpoint + UI. Added a `POST` route for bulk
status transitions (Approve / Waitlist / Deny / Move-to-pending) over a
list of applicant IDs, and a client toolbar on the admin queue that
operates on the **currently filtered** visible set. tsc clean, vitest
110/110 green.

### Detail of changes made:
- New route `src/app/api/admin/events/[id]/applicants/bulk/route.ts`:
  - Node runtime. Admin-gated via `isAdmin()` (403 on fail).
  - Body shape `{ applicantIds: string[]; status: ApplicantStatus; reason?: string }`.
  - 400 when `applicantIds` is empty / not an array.
  - Delegates to `bulkTransition()` in `@/lib/events`, which loops
    `transitionApplicant` per id (so every row still hits the audit log
    + state-machine path). Reason defaults to `bulk:<actor-email>`.
  - Returns `{ ok: true, count: n }`.
- New client component `src/components/admin/BulkAllToolbar.tsx`:
  - Renders nothing when `applicantIds.length === 0`.
  - Four buttons (approve / waitlist / deny / pending) with
    color-coded styling matching the row action set.
  - `confirm()` prompt with count before firing the POST.
  - `busy` state disables all buttons during the request; uses
    `router.refresh()` afterwards so rows move to the new status tab.
- `src/app/(authed)/admin/events/[id]/page.tsx`:
  - Imports `BulkAllToolbar`.
  - Renders it between `<ApplicantQueueFilters />` and the table, with
    `applicantIds={filtered.map((a) => a.id)}` — so the toolbar
    operates only on the rows the admin is currently looking at
    (status tab + side + minScore filter).

### Potential concerns to address:
- `bulkTransition` is sequential (await-in-loop). Fine at queue size
  ~200, but if we ever raise the limit substantially we should batch
  or parallelize.
- No optimistic UI — the toolbar waits for the POST round-trip then
  triggers `router.refresh()`. Acceptable for the operator's
  low-frequency workflow.

---

## Progress Update as of 2026-05-22 05:06 PM Pacific

### Summary of changes since last update
Wired the existing `ApplicantQueueFilters` dropdowns to actually filter
the admin applicant queue. The server page now reads `side` and
`minScore` from `searchParams` (alongside `status`) and applies the
filter server-side after the eval join. tsc clean, full suite 110/110
green.

### Detail of changes made:
- `src/app/(authed)/admin/events/[id]/page.tsx`: after loading
  `applicants` and the eval map, compute `minScoreNum` from
  `sp.minScore` (parseInt, defaults to 0) and `sideFilter` from
  `sp.side` (only `"founder"` or `"investor"`, else `null`).
- Build `filtered = applicants.filter(...)` using the eval-joined data:
  - Applicants with no eval row are kept only when both filters are
    inactive (so the unscored queue still shows everything by default).
  - `sideFilter === "founder"` drops rows with `founderScore <= 0`;
    `sideFilter === "investor"` drops rows with `investorScore <= 0`.
  - `minScoreNum > 0` drops rows whose `max(founderScore,
    investorScore)` is below the threshold.
- Replaced `applicants.map(...)` with `filtered.map(...)` in the table
  body, and updated the empty-state check + copy: now reads
  "No applicants in <status> matching the current filters." when either
  filter is active, otherwise the original "No applicants in <status>."
- Filters live entirely on the server page; no changes to the existing
  client `ApplicantQueueFilters` component, which already writes `side`
  and `minScore` to the URL via `router.replace`.

### Potential concerns to address:
- Filter is post-load, not in SQL — `listApplicants` still caps at 200
  before filtering. If an event ever exceeds ~200 applicants in a given
  status, scored filters may visibly drop entries that exist deeper in
  the queue. Push down into the DB query if/when volume warrants it.

## Progress Update as of 2026-05-22 05:03 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
T12 done: admin applicant queue at `/admin/events/[id]` with status
tabs, filters, per-row approve/pending/waitlist/deny actions, and admin
notes. tsc clean, full suite 110/110 green.

### Detail of changes made:
- New `src/app/(authed)/admin/events/[id]/page.tsx`: server component
  guarded by `requireAdmin()`. Resolves `{ id }` from `params` (Promise)
  and `{ status, minScore, side }` from `searchParams` (Promise). Calls
  `getEventById(id)` and `notFound()` on miss. Default status filter is
  `"scored"`; valid statuses are `pending|scored|approved|denied|waitlist`.
  Loads up to 200 applicants via `listApplicants`, joins to `evaluations`
  with a single `inArray` query keyed by `evaluationId`, then computes
  counts per status with `Promise.all` over `ALL_STATUSES` (limit 1000).
  Header shows title, "Capacity <approved>/<cap>", approval mode, slug.
  Status tabs link with `?status=…`; active tab is white/black, others
  zinc-on-zinc. Empty state renders a one-liner instead of the table.
- New `src/components/admin/ApplicantQueueFilters.tsx` (client): "side"
  dropdown (`founder|investor|either`) and "min score" number input;
  changes write back through `useRouter().push()` with the existing
  search params preserved.
- New `src/components/admin/ApplicantRow.tsx` (client): one `<tr>` per
  applicant. Name + LinkedIn + email in col 1, "F / I" scores in col 2,
  company stage, status, and an action cell with four buttons
  (`Approve|Pending|Waitlist|Deny`) plus an inline `<textarea>` for the
  admin note. Buttons PATCH `/api/admin/events/[id]/applicants/[applicantId]`
  with `{ status }` then `router.refresh()`; textarea saves on blur with
  `{ adminNote }`. Buttons disabled while a transition is in flight.
- New `src/app/api/admin/events/[id]/applicants/[applicantId]/route.ts`:
  `runtime = "nodejs"`. Guards with `isAdmin()` (403). Pulls actor email
  from Clerk's `currentUser()` (falls back to `"admin"`). Accepts
  `{ status?, adminNote?, reason? }`. `adminNote` is a direct
  `db.update()` on `eventApplicants`; `status` goes through
  `transitionApplicant()` so the audit log + decision emails fire. The
  default reason is `manual:<actor-email>` when none is provided.

### Potential concerns to address:
- Counts query fires 5 parallel `listApplicants` with `limit: 1000` each
  — fine for now but quadratic-ish if any single event blows past 1k
  applicants. Eventually swap for a `count()` query per status.
- Filters component currently only writes `side` and `minScore` to the
  URL — the server page doesn't yet apply them (we only filter by
  `status`). Listed as a follow-up in the plan; today filters affect the
  URL but not the displayed rows.
- `adminNote` update has no server-side length cap and skips the audit
  log on purpose (notes are admin-only annotations, not decisions).

## Progress Update as of 2026-05-22 05:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
T11 done: admin create-event form at `/admin/events/new`, criteria
builder client component, and `POST /api/admin/events` route. tsc clean,
full suite 110/110 green.

### Detail of changes made:
- New `src/components/admin/EventCriteriaBuilder.tsx` exporting
  `NewEventForm` — client component. Single-page form with Title, Slug
  (pattern `[a-z0-9-]+`, mono), Host name/email, Starts at / Ends at
  (`datetime-local`), Venue, Capacity (blank = unlimited), Description,
  and an "Approval & criteria" fieldset: approval mode (manual/hybrid/
  auto), target side (founder/investor/either), min founder score, min
  investor score, and an 8-checkbox stage allow-list (`pre-seed`, `seed`,
  `series-a`, `series-b`, `series-c+`, `growth`, `public`, `acquired`)
  with all stages pre-checked. Posts JSON to `/api/admin/events`; on
  success does a full-nav `window.location.href = /admin/events/<id>`
  (not router.push) so the detail page loads fresh.
- New `src/app/(authed)/admin/events/new/page.tsx`: server component,
  `await requireAdmin()`, renders `<NewEventForm/>` under an H1.
- New `src/app/api/admin/events/route.ts`: `runtime = "nodejs"`. Guards
  with `isAdmin()` (403). Validates required fields (`slug`, `title`,
  `startsAt`) and slug regex (`/^[a-z0-9-]+$/`, 400). Inserts into
  `events` with `status: "open"`, `createdByEmail` from Clerk session,
  and the `criteria` JSON from the builder. Returns `{ id, slug }`.
- Slug-duplicate inserts will surface as a generic 500 from the PG
  unique-index violation — acceptable for now; T15 can wrap into a
  nicer 409 if needed.

### Potential concerns to address:
- API does not yet wrap the unique-violation error from the
  `events_slug_unique` index — duplicates surface as 500 instead of 409.
- Form has no client-side debouncing for slug uniqueness — operator only
  finds out on submit.
- `criteria` is stored as untyped jsonb; the schema does not enforce
  shape. Evaluator (`evaluateCriteria` from T2) is the only consumer
  today.

## Progress Update as of 2026-05-22 04:58 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
T10 done: new admin events index at `/admin/events` plus a top-of-page
"Events →" link added to `/admin`. tsc clean, full suite 110/110 green.

### Detail of changes made:
- New `src/app/(authed)/admin/events/page.tsx`: server component, calls
  `requireAdmin()` (403 for non-admins), lists up to 100 events ordered
  by `createdAt desc`. Columns: Title (links to `/admin/events/<id>`),
  Slug (mono), Starts (date), Status, Approval mode. Empty state shows
  "No events yet." Header has "+ New event" button linking to
  `/admin/events/new` (not yet implemented — T11). Mirrors the layout of
  the scoring-jobs table in `/admin/page.tsx`.
- Modified `src/app/(authed)/admin/page.tsx`: added a small breadcrumb
  row above the "Scoring jobs" H1 with `<a href="/admin/events"
  className="link text-sm">Events →</a>`. Existing `+ New job` header
  row and scoring-jobs table untouched.
- Note: `/admin/page.tsx` itself still does not call `requireAdmin()` —
  that's a pre-existing gap inherited from the prior admin work, not
  something this task introduces. Worth tightening in a follow-up.

### Potential concerns to address:
- `/admin/events/new` is linked but doesn't exist yet — clicking it 404s
  until T11 lands.
- `/admin/events/<id>` detail route is linked from the table but is also
  T12's territory; same 404 caveat.
- `/admin` page does not enforce `requireAdmin()` at the page level (it
  relies on the `(authed)` Clerk gate plus the admin-only nav surface).
  Consider adding `requireAdmin()` for defense-in-depth.

## Progress Update as of 2026-05-22 04:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
T6 done: sync apply flow + `AppliedBanner` wired into `/welcome` and
`/not-this-round`. New public route `POST /api/events/[slug]/apply` and
public page `/events/[slug]/apply` (client form posts to `/api/eval`
first, then `/api/events/[slug]/apply`). All 4 task-specific tests pass;
full suite 110/110 green; tsc clean.

### Detail of changes made:
- New `src/app/api/events/[slug]/apply/route.ts`: validates body, loads
  event (404 on draft/missing, 410 on closed/past), reloads evaluation,
  re-canonicalizes its `linkedinUrl` defensively, dedupes via
  `(event_id, linkedin_url)`, optionally attaches a case-insensitive
  `bypassCodes` row if `inviteCode` matches and is scoped to this event
  (or global), inserts the applicant in `scored` status, then calls
  `processEventApplicantAutoRule(applicantId)` inline. Returns
  `{ ok, applicantId, duplicate }`.
- New `src/components/events/ApplyForm.tsx` (client): two-phase submit —
  POST `/api/eval` with `{ linkedinUrl }` → shows "Scoring your
  profile…" UI for ~10–20s → POST `/api/events/<slug>/apply` with
  `{ evaluationId, email, fullName?, needs?, inviteCode? }` →
  `router.push` to `/not-this-round?...&applied=<slug>` for
  `status==="low-signal"`, otherwise `/welcome?...&applied=<slug>`.
  Note: `/api/eval`'s actual return shape is `{ evaluationId, status,
  combinedScore, ... }`, *not* `{ evaluationId, signalQuality }` like
  the plan suggested — the form keys off `status === "low-signal"`.
- New `src/app/events/[slug]/apply/page.tsx` (RSC): looks up event via
  `getEventBySlug`, 404s on draft/missing, renders `<ApplyForm />`.
- New `src/components/events/AppliedBanner.tsx` (client): gold one-liner
  with auto query-strip of `?applied=…` after first render (mirrors
  `ClaimSuccessBanner`). Has a manual `×` dismiss too.
- Modified `src/app/(authed)/welcome/page.tsx`: added `applied?: string`
  to searchParams, look up the event title by slug, render the banner
  above `<ClaimSuccessBanner />` inside `<main>`. Also preserve
  `applied` in the redirect to `/not-this-round` when a logged-in
  applicant lands on /welcome with a low-signal eval.
- Modified `src/app/not-this-round/page.tsx`: same searchParams +
  lookup pattern; banner renders at the top of `<main>`.
- New test `tests/app/events-apply.test.ts` (4 tests): create-applicant
  happy path, 404 on draft, 400 on missing fields, idempotency on
  re-submit. Uses `vi.mock("@/lib/email", …)` to keep auto-mode
  side-effects hermetic (current tests all use `manual` mode so the
  stub is defensive).

### Potential concerns to address:
- Flaky first-run DB timeouts: the full suite occasionally times out on
  the first run after a cold Neon serverless start (saw 4 unrelated
  `tests/lib/events*.test.ts` + `tests/app/scoring-tick-events.test.ts`
  timeouts in one run, all green on retry). Not caused by T6 but worth
  watching as suite grows.
- `/api/eval` is IP-rate-limited per day; the apply flow consumes one
  slot per cache-miss URL. If we open events publicly we may need to
  bump `EVAL_PER_DAY_LIMIT` or scope rate limits per surface.
- `inviteCode` look-up silently ignores bogus codes (no UI feedback).
  Acceptable for v1 since auto-rule downstream can still
  approve/deny based on score alone; revisit if invite codes become
  load-bearing.

## Progress Update as of 2026-05-22 04:48 PM Pacific

### Summary of changes since last update
Fix: `src/lib/email.ts` regressed when `resend@6.12.3` started throwing
"Missing API key" from the constructor — previously `new Resend("")` silently
accepted an empty string. Eager module-load construction crashed any test
that transitively imported `@/lib/email` (e.g. `tests/app/scoring-tick-events.test.ts`).
Switched to lazy init via a private `client()` getter; the constructor is now
called on first send rather than at import time.

### Detail of changes made:
- `src/lib/email.ts`: replaced module-scope `const resend = new Resend(...)`
  with `let _resend: Resend | null = null` + `function client(): Resend` that
  constructs on first call. Both `sendApprovedEmail` and `sendFutureEventsEmail`
  now call `client().emails.send(...)`. Public API is unchanged.
- Tests verified passing: `tests/lib/email.test.ts` (3), `tests/app/scoring-tick-events.test.ts`
  (3), `tests/lib/events-email.test.ts` (2), `tests/lib/events.test.ts` (4).
  `pnpm exec tsc --noEmit` clean.

### Potential concerns to address:
- Missing `RESEND_API_KEY` at runtime now defers the failure to the first
  `emails.send()` call, where the real Resend SDK throws its own
  "Missing API key" error. Considered adding an explicit
  `throw new Error("RESEND_API_KEY is not set")` but that broke
  `tests/lib/email.test.ts` (mocks the `resend` module without setting the
  env var). The SDK's own error message is acceptable; if we want a clearer
  error in production, the test setup should be updated to seed
  `RESEND_API_KEY` (out of scope for this surgical fix).

## Progress Update as of 2026-05-22 04:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
T5: shipped the public event landing page at `/events/<slug>`. Server
component pulls the event via `getEventBySlug`, 404s on missing slug or
`status === "draft"`, sets `<title>` + description via `generateMetadata`,
and renders a centered hero (Spectral display headline, host, start time
in `America/Los_Angeles`, optional venue, optional description, gold CTA
linking to `/events/<slug>/apply`). Lives outside `(authed)` so no Clerk
on the public path.

### Detail of changes made:
- `src/app/events/[slug]/page.tsx` (new) — Next.js 16 dynamic route,
  `params: Promise<{ slug: string }>` per the codebase's existing pattern.
  Uses `notFound()` for missing/draft events. `generateMetadata` returns
  `{}` when the event is missing so the route still 404s without a
  hardcoded title leak. Layout matches `/chatham` conventions: `bg-[#151515]`,
  `max-w-2xl mx-auto`, Founder Festival logo at top, `font-display` heading,
  `#dfa43a` gold CTA.
- The `/events/<slug>/apply` link target is a placeholder for T6 (apply
  flow). Until T6 lands, clicking it will 404 — that's intentional per the
  plan sequencing.

### Potential concerns to address:
- Smoke test (insert a row, hit `/events/t5-smoke`) was skipped — no `psql`
  on this dev box. `pnpm exec tsc --noEmit` and the full `pnpm vitest run`
  suite (103 tests passing; the one failing suite `scoring-tick-events`
  was already broken before this commit due to a Resend env issue and is
  unrelated to T5). Real smoke needs to happen against a deployed preview
  or a local dev server with `DATABASE_URL` reachable.
- `event.description` is rendered as `whitespace-pre-wrap` plain text. If
  hosts paste long-form markdown into description, we'll want to revisit
  rendering (markdown component or `dangerouslySetInnerHTML` with a
  sanitizer) — out of scope for P1.

## Progress Update as of 2026-05-22 04:41 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
T9: wired decision-triggered emails into `transitionApplicant`. Approved
transitions fire `sendApprovedEmail` (with optional founder/investor score
when the applicant has an `evaluationId`); waitlist + denied transitions
fire `sendFutureEventsEmail` (no scores, no rejection language). Email
failures are caught + logged so a Resend outage cannot roll back the DB
status update.

### Detail of changes made:
- `src/lib/events.ts` — added `sendApprovedEmail`/`sendFutureEventsEmail` +
  `evaluations` imports. After the `db.batch` and before returning, the
  function re-reads the event by `current.eventId` to get title/startsAt/
  venue, then conditionally reads the evaluation row by `current.evaluationId`
  to surface scores in the approved email. The whole side-effect block sits
  inside a `try/catch` that logs and swallows errors (per task spec — email
  is best-effort, status persistence is the source of truth).
- `tests/lib/events-email.test.ts` (new) — two specs verifying
  `sendApprovedEmail`/`sendFutureEventsEmail` are invoked with the right
  `to` recipient on `approved` and `waitlist` transitions. Uses `vi.mock`
  to stub `@/lib/email` so Resend is never touched.
- `tests/lib/events.test.ts` — added the same `vi.mock("@/lib/email", …)`
  at the top of the file so the T3 suite doesn't try to instantiate the
  Resend client (no `RESEND_API_KEY` in the test env).

### Potential concerns to address:
- `current.evaluationId` is currently always `null` for new applicants
  (T6's apply flow hasn't yet been wired to attach an evaluation), so the
  score block in the approved email is omitted in practice today. Once
  T6 lands and applicants get linked to evaluations, the score will start
  appearing — verify the rendering then.
- `lumaUrl` is hard-coded to `null` (P3 work). Approved email currently
  has no calendar-confirmation link; the operator will need to follow up
  manually until P3 ships.
- The try/catch around email is broad. If we later want to surface email
  failures to admins (e.g. retry queue), we'll need to capture + persist
  the error rather than just `console.error`.

## Progress Update as of 2026-05-22 04:55 PM Pacific

### Summary of changes since last update
T8: extended `/api/cron/scoring-tick` to evaluate the per-event
auto-approval rule after each successful eval. Exports
`processEventApplicantAutoRule(applicantId)` so T6's apply route can
call it directly when an eval already exists for the URL at apply
time.

### Detail of changes made:
- `src/app/api/cron/scoring-tick/route.ts`:
  - New imports: `evaluations`, `events as eventsTable`,
    `eventApplicants` from `@/db/schema`; `evaluateCriteria`,
    `Criteria`, `Stage` from `@/lib/criteria`; `transitionApplicant`
    from `@/lib/events`.
  - New exported helper `processEventApplicantAutoRule(applicantId)`:
    loads applicant + event + eval; if event mode is `manual`, no-op;
    otherwise calls the pure `evaluateCriteria`; on `approved` →
    `transitionApplicant({toStatus:"approved", actorEmail:"system:auto"})`;
    on `denied` AND event mode is `auto` →
    `transitionApplicant({toStatus:"denied", actorEmail:"system:auto"})`;
    otherwise (hybrid + denied OR any `review`) leaves the row in
    `scored` for admin triage. Idempotent: bails if applicant is not
    in `scored` status or has no linked eval.
  - Tick handler now has a top-of-loop "orphan pending" pass: every
    tick (regardless of claimable items) it joins `event_applicants`
    against `evaluations` by `linkedin_url`, picks up to 20
    `pending` applicants whose URL already has an eval, flips them
    to `scored` (linking the eval), and runs the auto-rule. This
    handles the race where the apply route created an applicant
    before the tick observed the eval.
  - Per-item hook: after a successful `runEval` insert, queries
    `event_applicants` for any rows in `pending` matching the just-
    scored `linkedinUrl`, links the new eval, flips status to
    `scored`, and runs the auto-rule on each.
  - The `Stage` cast on `companyStage`/`investorStageFocus` is
    documented in the helper — DB stores text; our Stage type is
    narrow. Same `as unknown as { investorStageFocus?: Stage[] }`
    cast on the eval row until Drizzle row types regenerate.
- `tests/app/scoring-tick-events.test.ts`: 3 cases — auto-approve
  qualifying applicant, auto-deny clear-miss in auto mode,
  near-miss in hybrid mode stays `scored`. All hit a real Postgres
  via the existing test setup. 3/3 pass.

### Potential concerns to address:
- The orphan-pending pass and the per-item hook both flip status by
  raw UPDATE (not via `transitionApplicant`) — intentional because
  this is `pending → scored`, an internal state transition with no
  human decision worth logging. Once status is `scored`, all further
  movement goes through `transitionApplicant` and writes audit
  rows. Worth a brief mention in T6's review.
- `processEventApplicantAutoRule` re-reads the applicant, event, and
  eval rows on every call. T6 will call this synchronously from the
  apply route hot path. If that ever becomes a bottleneck, the
  obvious win is to accept already-loaded rows as optional
  parameters. Not urgent.
- The orphan-pending pass is hard-limited to 20 per tick. If a flood
  of applicants ever arrives before the scoring tick runs, they
  drain across multiple ticks (1-minute cadence in the current
  vercel.json), so worst case latency for a stuck `pending` is a
  few minutes. Probably fine for v1.

## Progress Update as of 2026-05-22 04:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two claim-flow correctness fixes from production debugging (need to
land on `polish`/`main` too; will cherry-pick over):

1. **Modal: try/catch fallback for stale `useUser().isSignedIn`.** The
   pre-flight `isSignedIn` check can read `false` during Clerk's
   initial load even when Clerk's internal client state already knows
   about a session. When that happens, `signIn.authenticateWithRedirect`
   throws "You're already signed in" and freezes the modal. Wrapped
   both the SSO call and `signIn.create` (email-link path) in a
   try/catch that detects the error message + Clerk error-code
   `session_exists` and falls through to the direct-callback redirect.

2. **Callback: provider-name matching.** Clerk's
   `externalAccount.provider` may be `"linkedin_oidc"` OR
   `"oauth_linkedin_oidc"` depending on SDK / instance config.
   Switched `startsWith("linkedin")` → `includes("linkedin")` (same
   for `github`). Without this, a successful LinkedIn sign-in could
   silently fall through to the email provider branch.

### Detail of changes made:
- `src/components/ClaimProfileModal.tsx`: try/catch wrap on `goSso()`
  and `signIn.create()` in `startEmailLink()`. Catch checks for
  "already signed in" substring or `errors[0].code === "session_exists"`.
- `src/app/(authed)/claim/callback/route.ts`: provider-name matcher
  switched from `startsWith` to `includes`.

## Progress Update as of 2026-05-22 04:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
T7: added `investorStageFocus` field to `SCORING_SCHEMA` (Zod) and
extended `SCORING_RUBRIC` so Claude is told to emit the stages an
investor primarily backs (max 3, same enum as `companyStage`). The
field is `z.array(z.enum([...stages])).default([])`, so older callers
that don't supply it parse cleanly while the typed output is always
populated. `payloadToWriteFields` in `src/lib/eval-pipeline.ts` now
forwards `scoring.investorStageFocus` into the `evaluations` row (and
the low-signal branch writes `[]`). DB column was already added in
T1's migration — schema and Zod now agree.

### Detail of changes made:
- `src/lib/scoring.ts`:
  - New field in `SCORING_SCHEMA` placed next to `companyStage`:
    `investorStageFocus: z.array(z.enum([...stages])).default([])`.
    Enum mirrors the existing `companyStage` values (idea, pre-seed,
    seed, series-a, series-b, series-c+, growth, public, acquired).
  - `SCORING_RUBRIC` prose extended in `==== EXTRAS ====` after the
    `companyStage:` paragraph: "when the subject is identifiable as
    an investor, list the stages they primarily back (max 3
    entries). Use the same enum as companyStage. Empty array if not
    an investor or stage focus is not stated."
- `src/lib/eval-pipeline.ts`:
  - `payloadToWriteFields` low-signal branch now sets
    `investorStageFocus: [] as string[]`.
  - Scored branch now sets `investorStageFocus: scoring.investorStageFocus`.
  - Both INSERT (`runEval`) and UPDATE (`reEvaluate`) flow through
    this single transformer, so the field persists on both paths.
- Tests:
  - New `tests/lib/scoring-schema.test.ts` (2 cases): parses array of
    stages; defaults to `[]` when omitted. Both pass.
  - `tests/lib/scoring.test.ts` updated: the `result()` factory now
    includes `investorStageFocus: []` since `ScoringResult` (the
    z.infer output type) requires the key present even with a Zod
    `.default([])`.

### Potential concerns to address:
- Anything reading the eval row that needs stage focus should pull
  it from `evaluations.investor_stage_focus` directly — there isn't
  yet a getter that surfaces it through `rowToResult`. T8 (auto-rule)
  and T2 (criteria checker) will need to read this column; if they
  read via `rowToResult` we'll need to plumb the field through.

## Progress Update as of 2026-05-22 04:27 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two surgical fixes to `src/lib/email.ts`: (1) pin `fmtDate` to
`America/Los_Angeles` so the "When:" line in approval emails renders
as PT (Vercel Functions run in UTC, which produced confusing GMT
strings for Bay-Area founder dinners); (2) guard `lumaUrl`
interpolation with an `^https://` regex so non-https values are
silently dropped from the email. Added a security comment block at
the top of the module marking the templates as operator-only and
flagging the need for HTML-escape before any applicant data lands.
New test pins the PT format: `/Mon, Jun 1.*6:00 PM PDT/` for a
`2026-06-02T01:00:00Z` input. Suite is 3/3 green on
`tests/lib/email.test.ts`; `tsc --noEmit` clean.

### Detail of changes made:
- `src/lib/email.ts`:
  - `fmtDate` now passes `timeZone: "America/Los_Angeles"` to
    `toLocaleString`. This is P1-correct since all current events are
    local to John/Jackie/Gerald in the Bay Area. If we later host
    events in other zones we'll need to pass the event's TZ through
    (likely a column on `events`).
  - `lumaLine` is now gated on `/^https:\/\//.test(opts.lumaUrl)` in
    addition to truthiness. Drops `javascript:` / `data:` / plain
    `http:` URLs out of an abundance of caution even though the
    field is operator-controlled today.
  - Added a top-of-file SECURITY comment block: templates are
    operator-only; any applicant-supplied data (display names,
    notes, company text) must be HTML-escaped before interpolation.
    No templating dep yet — switch to a small escape helper when
    applicant data lands.
- `tests/lib/email.test.ts`:
  - New test "formats startsAt in Pacific time" — uses
    `new Date("2026-06-02T01:00:00Z")` (6 PM PT on June 1, PDT) and
    asserts the rendered HTML matches `/Mon, Jun 1.*6:00 PM PDT/`.
    Inspects the most-recent mock call so it's robust to test order.

### Potential concerns to address:
- Pacific-time pin is hard-coded. Multi-region events will need an
  event-level TZ column. Not P1.
- The https guard is defensive given that `lumaUrl` is currently
  admin-configured, but if we ever expose this field via an
  applicant-facing form it must also be re-validated server-side.
- Security comment is advisory only — there is no escape helper
  yet. The moment applicant data is interpolated, this needs to
  graduate from a comment to actual code.

## Progress Update as of 2026-05-22 04:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
T4 complete: Resend email wrapper at `src/lib/email.ts`. Two helpers:
`sendApprovedEmail` (includes optional FounderScore/InvestorScore block
per OD-2) and `sendFutureEventsEmail` (no rejection language — "future
events" framing per spec). Resend SDK installed (`resend ^6.12.3`);
`.env.example` documents `RESEND_API_KEY` and `RESEND_FROM`. Full test
suite is 80/80 green; `tsc --noEmit` clean.

### Detail of changes made:
- `src/lib/email.ts` — new module. Module-level
  `new Resend(process.env.RESEND_API_KEY ?? "")` (the SDK accepts an
  empty constructor arg, so module import is safe in dev without keys).
  - `FROM` defaults to `"Founder Festival <hello@festival.so>"`;
    operator confirmed DNS for `festival.so` is verified in production.
  - `fmtDate()` uses `toLocaleString("en-US", …)` with weekday, month,
    day, hour, minute, and `timeZoneName: "short"`. Server-side TZ in
    prod is UTC, so surfacing the short TZ name avoids ambiguity. If
    we later localize per-applicant we'll revisit.
  - `sendApprovedEmail({to, eventTitle, startsAt, venue, lumaUrl, score?})`:
    conditionally renders `venue`, `lumaUrl`, and `score` lines. The
    score block is muted gray (#666, 13px) and only renders if `score`
    is provided; `investor` is shown only when > 0.
  - `sendFutureEventsEmail({to, eventTitle})`: subject is "Thanks for
    applying to {title}"; body says the gathering is "at capacity" and
    offers to keep the applicant on the list for future events.
    Deliberately omits FounderScore — applicants who don't make a cut
    don't see their score (per spec).
  - Both helpers throw `Error("resend: <message>")` on Resend error and
    return `{ id: string }` (empty string if Resend returned no data).
- `tests/lib/email.test.ts` — Vitest mock of `resend` replaces the
  `Resend` class. Important divergence from the verbatim plan:
  - Plan used `vi.fn().mockImplementation(() => …)` (arrow). Vitest 4
    rejects arrow functions when called with `new` (TypeError "not a
    constructor"). Switched to a regular `function () { return … }` —
    same behavior, but constructable.
  - Plan's second test read `Resend.mock.results[1].value`. The
    implementation instantiates `Resend` exactly once at module load,
    so `results[1]` is undefined. Both helpers share the same
    `emails.send` mock; the second test now reads
    `mock.results[0].value.emails.send.mock.calls[1][0]` (the second
    send call). Spec intent preserved — assertions still verify no
    rejection language.
  - Test 1: subject matches `/you'?re in/i`, HTML contains the venue.
  - Test 2: neither subject nor body matches
    `/reject|denied|sorry|unfortunately/i`.
- `.env.example` — appended `# Resend (transactional email)` section
  with `RESEND_API_KEY=` and
  `RESEND_FROM="Founder Festival <hello@festival.so>"`. Pre-existing
  file had no trailing newline; added a blank line above the section
  for readability.
- `package.json` / `pnpm-lock.yaml` — added `resend ^6.12.3`.

### Potential concerns to address:
- Empty `RESEND_API_KEY` won't crash module import, but any actual
  send call will fail at runtime. Decision-triggered sends (T9) need
  to wrap these helpers in try/catch + log to `applicantDecisionLog`
  so a Resend outage doesn't roll back the DB transition. Plan
  accordingly when wiring T9.
- HTML in templates is hand-built — `eventTitle`, `venue`, and
  `lumaUrl` are not escaped. Today these are operator-controlled
  values (admin form input), but if applicant-controlled strings
  ever flow into emails we need to escape at template or sanitize at
  input. Worth noting for the admin form (T11).
- The future-events email subject mentions the event title. If we
  ever send a generic "thanks, no current match" email *across*
  events, we'll need a different helper. For now this matches the
  per-event cron model in T8/T9.

## Progress Update as of 2026-05-22 04:16 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed a stale-return bug in `transitionApplicant`: it was returning
`{ ...current, status: opts.toStatus }`, which left
`decisionReason`, `decidedByEmail`, `decidedAt`, and `updatedAt`
showing pre-update values to callers even though the DB had the
fresh values. Now the returned object is built from the same `now`
timestamp + actor inputs that were written, so the in-memory result
matches the row on disk. Added a regression test pinning the
contract; suite is 4/4 green.

### Detail of changes made:
- `src/lib/events.ts` — `transitionApplicant` final return now
  spreads `current` then overlays `status`, `decisionReason`,
  `decidedByEmail`, `decidedAt: now`, `updatedAt: now`. The `now`
  declaration was already positioned above the `db.batch()` (so
  the value passed to the UPDATE and the value in the returned
  object are the same `Date` instance — no skew).
- `tests/lib/events.test.ts` — new test:
  `transitionApplicant returns an object reflecting the
  just-applied update`. Asserts `status`, `decisionReason`,
  `decidedByEmail`, and that `decidedAt` is not null on the
  function's return value (no re-read needed).
- `pnpm vitest run tests/lib/events.test.ts` → 4/4 pass.
  `pnpm exec tsc --noEmit` → clean.

### Potential concerns to address:
- Callers that previously relied on the stale-return behavior to
  see the pre-transition `decidedAt` would now see fresh values.
  Grep shows no such caller — only the new test reads these fields
  off the return value — but worth keeping in mind as more code
  consumes `transitionApplicant`'s return.

## Progress Update as of 2026-05-22 04:13 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
T3 complete: `src/lib/events.ts` is now the blessed entry point for
mutating `event_applicants` status. Exports `getEventBySlug`,
`getEventById`, `listApplicants`, `transitionApplicant`, and
`bulkTransition`. Every status change writes a paired
`event_decision_log` row atomically via `db.batch()`. Vitest
integration suite at `tests/lib/events.test.ts` is 3/3 green.

### Detail of changes made:
- `src/lib/events.ts` — new module. `ApplicantStatus` union
  (`pending | scored | approved | denied | waitlist`) is the
  in-process contract; the DB column is plain text, so any future
  enum-widening is an in-code change only.
- `transitionApplicant`: reads current row, short-circuits if
  `toStatus === current.status` (idempotent — returns the
  unchanged row), otherwise issues an UPDATE on `event_applicants`
  (status, decisionReason, decidedByEmail, decidedAt, updatedAt) and
  an INSERT on `event_decision_log` (fromStatus, toStatus, reason,
  actorEmail) inside a single `db.batch([...])` call.
- **Driver note**: the plan literally said `await db.transaction(async (tx) => { ... })`,
  but the project uses `drizzle-orm/neon-http`, whose `.transaction()`
  unconditionally throws `"No transactions support in neon-http
  driver"`. Swapped to `db.batch([...])` — neon-http's atomic
  multi-statement primitive — so UPDATE + audit-log INSERT still
  succeed-or-fail together. T9 (email side-effects) and T13 (bulk
  perf) will need to keep that constraint in mind.
- `listApplicants`: accepts either a single status or an array
  (both shapes are used downstream — admin queue may pass
  `["pending","scored"]`). `orderBy desc(createdAt)`. Default
  `limit=50, offset=0` so admin pagination is a no-thinking call.
- `bulkTransition`: simple sequential per-id loop on
  `transitionApplicant`. P1 ok — T13 may revisit if N gets large.
- `tests/lib/events.test.ts` — 3 integration tests exactly as
  specified in the plan: `getEventBySlug` round-trip,
  `transitionApplicant` writes audit log + updates applicant,
  `listApplicants` filters by status. Hits the live Neon DB
  (same one the schema lives in).
- **Migration application**: the T1 PRD entry said
  `drizzle/0001_complex_blacklash.sql` was applied to Neon, but
  when this test ran it errored with `relation "events" does not
  exist`. Ran `pnpm db:push` which diffs current schema → DB and
  applied the events / event_applicants / event_decision_log /
  event_invites tables plus the `bypass_codes.event_id` and
  `evaluations.investor_stage_focus` columns. After push the
  3 tests pass.

### Potential concerns to address:
- `db.batch()` is the only atomic primitive available on the
  neon-http driver. Anywhere else in this codebase that needs a
  multi-statement transaction has the same constraint — if a
  future task literally says "wrap in `db.transaction`", swap it
  for `db.batch` (or split into Postgres function on the DB side).
- T1's PRD claim that the migration was applied turned out to be
  inaccurate — `db:push` was needed before T3's integration tests
  could pass. Future tasks that depend on event tables on a fresh
  environment should `pnpm db:push` (or run the migration) as
  part of their bootstrap.
- `bulkTransition` is currently N synchronous round-trips. For
  large bulk-approve batches this will be slow. Acceptable for P1
  (admin tools, typically tens of rows); T13 should benchmark
  with realistic event sizes.

## Progress Update as of 2026-05-22 04:09 PM Pacific

### Summary of changes since last update
T2 code-review follow-ups: replaced the `investorOk!` non-null assertion
in `evaluateCriteria` with a defensive branch that returns a `review`
decision for any future `Side` value not handled by `tryFounder`/`tryInvestor`,
and pinned the "skip stage check when stage info is null/empty"
contract with two new Vitest cases. Test suite now 9/9 green.

### Detail of changes made:
- `src/lib/criteria.ts`: trailing logic of `evaluateCriteria` now falls
  through to `{ decision: "review", reason: "unknown side: <value>" }`
  instead of `return investorOk!;`. This guards the function against
  silent crashes if anyone extends the `Side` union without updating
  the two `try*` predicates above.
- `tests/lib/criteria.test.ts`: added two cases — `companyStage: null`
  on a `founder` side still approves (pending-score window), and
  `investorStageFocus: []` on an `investor` side still approves. These
  pin the documented "skip when allow-list OR applicant data is empty"
  behavior so it doesn't silently regress.
- Verified: `pnpm vitest run tests/lib/criteria.test.ts` → 9/9 pass;
  `pnpm exec tsc --noEmit` → clean.

### Potential concerns to address:
- None new. T2 is now closed; T3 (Events DB helpers + audit log) is
  next in the P1 queue.

## Progress Update as of 2026-05-22 04:04 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
T2 complete: pure criteria evaluator at `src/lib/criteria.ts` with
Vitest coverage at `tests/lib/criteria.test.ts`. Implements
`evaluateCriteria(criteria, applicantSnapshot)` returning
`approved | denied | review`. Bypass code short-circuits to
approved; near-miss (≥70% of floor) flags review for admin; stage
allow-list applied to founder `companyStage` and investor
`investorStageFocus`. 7/7 tests pass.

### Detail of changes made:
- `src/lib/criteria.ts` — new module. Exports `Side`, `Stage`,
  `Criteria`, `ApplicantSnapshot`, `Decision`, `EvaluateResult`, and
  the `evaluateCriteria` function. `Stage` literal union matches the
  scoring rubric values used in `evaluations.companyStage`
  (`idea | pre-seed | seed | series-a | series-b | series-c+ |
  growth | public | acquired`).
- Logic: bypass code → approved. Otherwise evaluate founder and/or
  investor sides per `criteria.side` (`founder | investor | either`).
  For each side, stage allow-list filter runs first, then score
  threshold with a 70% near-miss band that flags `review` instead of
  `denied`. `either`-side events combine the two sides: any approval
  wins; otherwise any review wins; otherwise denied.
- `REVIEW_NEAR_MISS_PCT = 0.7` is a const, intentionally not
  configurable for P1 (per the plan — hybrid mode UX choice).
- Reasons are formatted as short audit-log strings, e.g.
  `auto:bypass_code`, `auto:founder_score:80>=80`,
  `founder stage series-b not in allow-list`,
  `near-miss criteria; admin review`. Downstream T8/T6 will persist
  these in `event_decision_log.reason`.
- TS narrowing fix relative to the plan's literal code: switched
  `const founderOk = tryFounder && checkFounder(...)` to
  `const founderOk: EvaluateResult | null = tryFounder ?
  checkFounder(...) : null` so `.decision` access narrows cleanly
  under strict mode.
- `tests/lib/criteria.test.ts` — 7 tests covering: bypass approval;
  founder at floor approved; founder below floor denied; founder
  out-of-stage denied; either-side near-miss → review; investor on
  `side=investor` approved; investor stage focus respected when
  `stages` is restricted.
- Pure function — no DB, no IO. Will be consumed by T6 (apply
  route) and T8 (cron tick) once those land.

### Potential concerns to address:
- The 70% near-miss band is hard-coded. If future events want
  different bands per-side (e.g. stricter for investors), this
  becomes per-event config — currently out of scope for P1.
- `evaluateCriteria` returns generic
  `"below founder and investor criteria"` when both sides fail on
  an `either` event. The per-side reasons are dropped in that
  branch. If audit logs need both, we'd return a structured
  `reasons: string[]` instead of a single `reason`. Defer until
  T13/T12 surface the need.

## Progress Update as of 2026-05-22 03:59 PM Pacific

### Summary of changes since last update
T1 complete: schema migration for `events`, `event_applicants`,
`event_decision_log`, `event_invites` tables; added `event_id` FK to
`bypass_codes` and `investor_stage_focus` JSON column to `evaluations`.
Migration generated as `drizzle/0001_complex_blacklash.sql` and applied
cleanly to the Neon DB. Schema test (`tests/db/schema.test.ts`) passes
4/4.

### Detail of changes made:
- `src/db/schema.ts` — added `events`, `eventApplicants`,
  `eventDecisionLog`, `eventInvites` pgTable definitions at the bottom
  of the file, matching the column/index/FK spec in the plan.
- `src/db/schema.ts` — added `eventId: uuid("event_id").references((): AnyPgColumn => events.id)`
  to `bypassCodes`. Uses an `AnyPgColumn`-typed lambda because `events`
  is declared after `bypassCodes`; this avoids a forward-reference TS
  error while still letting drizzle-kit emit the FK.
- `src/db/schema.ts` — added `investorStageFocus: jsonb("investor_stage_focus").$type<string[]>().default(sql\`'[]'::jsonb\`)`
  to `evaluations`, between `pricing` and `source`.
- `src/db/schema.ts` — added `type AnyPgColumn` to the import from
  `drizzle-orm/pg-core`.
- `tests/db/schema.test.ts` — new failing-then-passing schema test.
  Column introspection uses `getTableColumns()` from `drizzle-orm`
  (the `._.columns` accessor in the plan is type-level only; Drizzle
  stores columns under a `Symbol(drizzle:Columns)` at runtime).
- `drizzle/0001_complex_blacklash.sql` — generated. Creates
  `events`, `event_applicants`, `event_decision_log`, `event_invites`,
  plus the previously-uncommitted `scoring_jobs` / `scoring_job_items`
  tables (their schema was added in commit `c78a881` but never had a
  migration generated — drizzle-kit picked them up here too). Also
  emits the two `ALTER TABLE` statements for `bypass_codes.event_id`
  and `evaluations.investor_stage_focus`, the FK constraints, and all
  indexes (`events_slug_unique`, `events_status_idx`,
  `event_applicants_event_linkedin_unique`,
  `event_applicants_status_idx`, `event_decision_log_applicant_idx`,
  `event_invites_code_unique`, `event_invites_event_idx`).
- `drizzle/meta/_journal.json` + `0001_snapshot.json` — auto-updated.

### Potential concerns to address:
- The 0001 migration also creates `scoring_jobs` + `scoring_job_items`,
  which were merged in `polish` (commit `c78a881`) without a migration.
  Production Neon will not have these tables yet; the apply will create
  them. Verify in T15 production setup that this is the expected
  behavior (it is — they're needed for the admin bulk-scoring tool).
- The schema test diverges slightly from the plan's literal text: it
  uses `getTableColumns()` instead of `(table as ...)._.columns` because
  the latter is a type-level accessor only and throws at runtime. Same
  assertions and intent.

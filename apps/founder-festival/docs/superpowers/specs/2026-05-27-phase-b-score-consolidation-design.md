# Phase B — retire `/admin/score`, fold its machinery onto `/admin/profiles` — design spec

Date: 2026-05-27
Branch: `events-v1`
Status: approved-by-delegation. The user is away and explicitly authorized "use your
best judgment so I can come back to a finished result," which overrides the
brainstorming approval gate. Every decision below is mine; the user can review/redirect
on return.

## Problem

Phase A consolidated the single-job **view** (`/admin/score/<id>` ≈
`/admin/profiles/<jobId>`) but deliberately left `/admin/score` and its running
machinery in place. That machinery is:
- the **jobs list** (table of scoring jobs: title/model/status/progress/cost),
- **+ New Bulk Scoring Job** (`/admin/score/new` → `NewJobForm` / `StaleRescoreForm`),
- **Re-Run All** (`RescoreAllButton`) and per-job **Re-run** (`RerunButton`),
- the **live single-job view** (`/admin/score/[id]` → `JobProgress`: 4s poll of
  `/api/admin/jobs/<id>`, localhost cron auto-driver hitting `/api/cron/scoring-tick`,
  progress bar, per-item table),
- an embedded **Spend** section (two summary cards + Vercel balance).

Phase B retires `/admin/score` entirely by relocating each piece into the
`/admin/profiles` area, then deleting the three score pages.

## Non-goals
- No change to the scoring backend: `/api/admin/jobs` (POST create), `/api/admin/jobs/[id]`
  (GET status / POST rerun), `/api/admin/rescore-all`, `/api/cron/scoring-tick` all stay
  as-is. This is purely a UI relocation + deletion.
- No DB migration.
- No change to how scoring actually runs (the localhost auto-driver behavior is preserved).

## Decisions

### 1. Live single-run view — `/admin/profiles/[jobId]` absorbs `JobProgress`
The page stays a **server component** (gate → `isUuid` → `listProfilesForJob`). Its gate
**widens** from `can("view_profiles")` to `can("view_profiles") || can("run_scoring_jobs")`
so a scoring-only admin who just created a job can watch it here (the create flow redirects
here). It keeps its Phase A header ("← All profiles", run title, "N scored · M not yet scored") and the
rich `<ProfilesScoredTable showStatus>` for **scored** rows. Added above the table: a new
client island **`<JobLiveProgress jobId costMultiplier>`** that:
- polls `/api/admin/jobs/<jobId>` every 4s and runs the **localhost cron auto-driver**
  (same logic as `JobProgress`: localhost-only, fire `/api/cron/scoring-tick` while
  `queued`/`running`, guard overlapping ticks),
- renders the **progress bar** + status line (`model · status · done/total · failed · est/actual`
  + LLM/Exa split), all ×cost-multiplier,
- renders a compact table of **only the not-yet-scored items** (status ≠ `done`:
  pending/resolving/scoring/failed/skipped) — subject, status, error. Scored (`done`)
  items already appear in the rich profiles table below, so they're omitted here (no
  duplication).
- On the job reaching a **terminal** status (`completed`/`failed`/`cancelled`) — detected
  as a transition from non-terminal — calls `router.refresh()` **once** to pull the newly
  scored profiles into the server-rendered table. (We do NOT refresh every tick; that would
  re-run `listProfilesForJob` + Clerk email resolution every 4s.)
- When the job is terminal **and** there are zero non-`done` items, the island collapses to
  a one-line "✓ completed · est/actual" summary (so a fully-successful run shows just the
  table; failed/skipped items keep the island visible with their errors).

`JobProgress` is refactored into this island (drop its own scored-items rows; keep
header/bar/auto-driver; add the terminal-refresh). The standalone `/admin/score/[id]` page
that rendered `JobProgress` is deleted.

### 2. Jobs list — a collapsible **Runs** panel on `/admin/profiles`
A new server component **`<RunsPanel>`** rendered between the page stats and the profiles
table. A queued/running job has no scored profiles yet, so it would otherwise be invisible
— the panel is how operators find in-flight, failed, and past runs.
- Uses a native `<details>` element (no client JS needed) — `open` by default iff any job
  is `queued`/`running`.
- `<summary>`: "Runs (N)".
- Body: the existing jobs table (title→`/admin/profiles/<jobId>`, model, status pill,
  progress, est/actual ×mult, created, per-job `RerunButton` for completed/failed/cancelled).
- Action buttons live just above the panel, gated on `run_scoring_jobs` (`canRun`):
  **+ New Bulk Scoring Job** (→ `/admin/profiles/new`) and **Re-Run All** (`RescoreAllButton`).
- Data: `db.select().from(scoringJobs).orderBy(desc(createdAt)).limit(50)` plus the
  `RescoreAllButton` inputs (`profileCount` via `count()` of `source="url"` evals,
  `centsPerProfile` via `getEstimateCents("sonnet"|"opus")`) — all moved from
  `/admin/score/page.tsx`. The panel only renders when `canRun` (a `view_profiles`-only
  admin sees just the profiles table).

### 3. New-job flow → `/admin/profiles/new`
New page `src/app/(authed)/admin/profiles/new/page.tsx` — a thin copy of the current
`/admin/score/new/page.tsx` (gate, `getEstimateCents`, `getViewerCostMultiplier`,
`<NewJobForm>`). Gated additionally on `run_scoring_jobs` (creating jobs is a scoring
action). `NewJobForm` and `StaleRescoreForm` change their post-success redirect target
from `/admin/score/<id>` → `/admin/profiles/<id>`.

### 4. Spend → the **Credits** page (`/admin/spend`)
The embedded `SpendSection` (the two summary cards "AI Agents" / "Deep Research" + the
Vercel account balance line) is **extracted into a component** `SpendSummary` and rendered
at the **top of `/admin/spend`** (which currently shows only the per-eval cost detail
table). `/admin/spend` gains the `getVercelCredits()` + `getRecordedSpend()` reads. The
embedded copy goes away with the deleted `/admin/score`. Net: Credits = summary cards +
per-eval detail, one home for cost.

### 5. Nav + hub
- **Keep** the "Bulk Score" nav item but **repoint** it `/admin/score` → **`/admin/profiles/new`**
  (FiBarChart2, `run_scoring_jobs`). This both preserves the just-shipped nav work and keeps
  a `run_scoring_jobs`-only admin able to start jobs (they can't see `/admin/profiles`, which
  is `view_profiles`).
- "Scored Profiles" (`/admin/profiles`, `view_profiles`, FiUser) stays as the results entry.
- **Most-specific-match nav highlight:** add `activeNavHref(pathname, items)` to
  `admin-nav.ts` returning the **longest** `item.href` that `isActiveNav`-matches, so
  `/admin/profiles/new` highlights "Bulk Score" (not "Scored Profiles" by prefix) and
  `/admin/profiles/<jobId>` highlights "Scored Profiles". `AdminNav` uses it.
- The `/admin` hub card "Bulk Score Founders & Investors" repoints `/admin/score` →
  `/admin/profiles/new` (matches its "paste a list / upload a CSV" body).

### 6. Deletions + link rerouting
Delete `src/app/(authed)/admin/score/` entirely (`page.tsx`, `new/page.tsx`,
`[id]/page.tsx`). Reroute every inbound `/admin/score…` reference:
- `NewJobForm`, `StaleRescoreForm`, `RerunButton`, `RescoreAllButton` redirects → `/admin/profiles/<id>`.
- `JobProgress`/`JobLiveProgress` rerun-of link `/admin/score/<rerunOfJobId>` → `/admin/profiles/<rerunOfJobId>`; its old "← All jobs" link is dropped (the server page already has "← All profiles").
- `/admin` hub card → `/admin/profiles/new`.
- `admin-nav.ts`: `/admin/score` entry repointed to `/admin/profiles/new` (label unchanged).
- `AdminNav.tsx`: icon key `/admin/score` → `/admin/profiles/new`.

## Components touched / created
- **Create** `src/components/admin/JobLiveProgress.tsx` (client) — the live island (refactor of `JobProgress`).
- **Create** `src/components/admin/RunsPanel.tsx` (server) — the collapsible jobs list + action buttons.
- **Create** `src/components/admin/SpendSummary.tsx` (server/presentational) — the two cards + Vercel balance, extracted from `score/page.tsx`'s `SpendSection`/`Card`.
- **Create** `src/app/(authed)/admin/profiles/new/page.tsx`.
- **Modify** `src/app/(authed)/admin/profiles/page.tsx` (render `RunsPanel` + New Job button; fetch jobs/estimates/canRun), `src/app/(authed)/admin/profiles/[jobId]/page.tsx` (render `<JobLiveProgress>` island), `src/app/(authed)/admin/spend/page.tsx` (render `<SpendSummary>`), `src/app/(authed)/admin/page.tsx` (hub card href), `src/lib/admin-nav.ts` (repoint + `activeNavHref`), `src/components/admin/AdminNav.tsx` (icon key + use `activeNavHref`), `NewJobForm.tsx`, `StaleRescoreForm.tsx`, `RerunButton.tsx`, `RescoreAllButton.tsx` (redirect targets).
- **Delete** `JobProgress.tsx` (replaced by `JobLiveProgress`) and the three `/admin/score` pages.

## Error handling
- `JobLiveProgress`: network/poll errors → inline "Error: …" (as `JobProgress` did); never throws. Auto-driver no-ops off-localhost / in prod (cron-secret gate). `router.refresh()` guarded to fire once per terminal transition.
- `/admin/profiles/[jobId]`: gate `adminGate` + (`can("view_profiles")` OR `can("run_scoring_jobs")`) + `isUuid` + null-job → `NotAuthorized`.
- `RunsPanel`: only rendered when `canRun`; the jobs query degrades to an empty list (no jobs → friendly empty row).

## Testing
- **`activeNavHref`** (pure) — unit test: `/admin/profiles/new` → `/admin/profiles/new`; `/admin/profiles/<uuid>` → `/admin/profiles`; `/admin/profiles` → `/admin/profiles`; exact + longest-match precedence.
- **`admin-nav` visibility** — update: `visibleNavItems(["run_scoring_jobs"])` → `["/admin/spend", "/admin/profiles/new"]` (Credits, Bulk Score); `view_profiles` → `["/admin/profiles"]`.
- **`rescore-all` test** — if it asserts a redirect path, update `/admin/score/<id>` → `/admin/profiles/<id>` (it tests the API route, which is unchanged — likely no change needed; verify).
- **Build/route** — `pnpm build` shows `/admin/profiles/new` and `/admin/profiles/[jobId]`, and NO `/admin/score*` routes.
- **Manual smoke (localhost :3002 + prod gate):** create a job from `/admin/profiles/new` → redirected to `/admin/profiles/<id>` → live progress drives to completion on localhost → scored profiles populate the table; Runs panel lists it; Re-Run All + per-job Re-run redirect into `/admin/profiles/<id>`; Credits page shows the summary cards; `/admin/score*` 404s.
- UI islands (live polling, `<details>` collapse) — manual smoke; the pure nav logic is unit-tested.

## Risks / notes
- The live island + server table split means scored rows appear in the table only after a
  `router.refresh()` (on completion). Acceptable: progress is visible live in the island;
  results land when the run finishes. (A future enhancement could refresh on each
  `completedItems` increase.)
- Deleting `/admin/score` is irreversible only in the sense of the working tree — it's in
  git history; all backend routes/components are preserved.
- `RescoreAllButton`/`RerunButton`/`NewJobForm`/`StaleRescoreForm` are reused unchanged
  except redirect strings — low risk.
- A `run_scoring_jobs`-only admin sees "Bulk Score" (→ `/admin/profiles/new`) and "Credits",
  and the create flow redirects to `/admin/profiles/<id>`. That single-run view's gate is
  therefore widened (decision §1) to `view_profiles` **OR** `run_scoring_jobs` so the
  create→watch flow works. Such an admin still can't see the full `/admin/profiles` list
  (`view_profiles` only) — acceptable; they reach their run via the post-create redirect and
  the Runs panel isn't shown to them.

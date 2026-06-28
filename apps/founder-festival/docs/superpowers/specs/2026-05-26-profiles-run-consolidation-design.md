# Consolidate the bulk-run view into `/admin/profiles` — design spec (Phase A)

Date: 2026-05-26
Branch: `events-v1`
Status: approved (design); Phase A to be planned + built next.

## Problem

Two admin views overlap:
- **`/admin/profiles`** — one row per scored profile (source, scores, cost, charge,
  user, etc.), sortable + CSV export.
- **`/admin/score/<jobId>`** (`JobProgress`) — one bulk run: its items, per-item
  **status**, score, cost, a live progress bar, and (on localhost) a cron
  auto-driver that scores items as you watch.

The goal is to make `/admin/profiles` able to show a single bulk run (so the score
job-detail view becomes redundant), and to let an operator filter the profile list
by labels (source + run names). Fully retiring `/admin/score` (its live progress,
auto-driver, New-Job/Re-Run-All controls, and Spend dashboard) is a larger,
separate effort — **Phase B, out of scope here**.

## Decisions (from brainstorming)

1. **Consolidate the VIEW first** (Phase A). Keep `/admin/score` and its running
   machinery for now.
2. **Show ALL runs** a profile belongs to (a re-scored profile can be in several
   bulk runs → a pill per run; filtering by any of them includes it).

## Data model (reads only — no migration)

A profile (evaluation) links to a bulk run via `scoring_job_items.evaluation_id →
scoring_jobs.id` (title on `scoring_jobs`). An eval can appear in multiple job
items / jobs (re-scores).

Extend `listScoredProfiles` so each `ScoredProfileRow` gains:

```ts
runs: { jobId: string; title: string | null }[]; // every bulk run this profile is in
```

Built from a single query: `scoring_job_items` (evaluation_id ∈ displayed ids)
joined to `scoring_jobs` (id, title), grouped by evaluation_id. (This replaces /
extends the existing `bulkSet` query, which already pulls `scoring_job_items` for
the displayed evals.) De-dup runs per eval by jobId.

## Labels & filtering

A **label** is one of:
- a **source** label: `Web` | `Bulk` | `API` (the row's derived source), or
- a **run** label: a bulk run's title (keyed by jobId).

A profile's labels = its source label + (for bulk) one run label per `runs[]`
entry. **Filter rule:** a profile is visible iff **any** of its labels is enabled.

### Filter control (on `/admin/profiles`)
- A "Filter" control at the top of the table (alongside the existing Badges
  toggle + Export CSV) listing every label present in the current rows — source
  labels then run titles — as checkboxes.
- **Select all** / **Select none** buttons. Default: all enabled (everything shown).
- Pure client-side state over the already-loaded rows (same model as sorting).
- Out of scope (Phase B nicety): reflecting the ad-hoc filter set in a query param.

## Source cell with run pills

Bulk rows render the existing `[Bulk]` source pill **plus one pill per run title**:

```
[Bulk] [7 YC Founders] [Q1 batch]
```

Each **run pill is a link to that run's persistent view** (`/admin/profiles/<jobId>`).
Web/API rows render just their source pill (no run pills).

## Persistent single-run view: `/admin/profiles/<jobId>`

New dynamic route `src/app/(authed)/admin/profiles/[jobId]/page.tsx`:
- Gated like `/admin/profiles` (`adminGate` + `can("view_profiles")`).
- Validates `jobId` (`isUuid`); 404/NotAuthorized otherwise. Looks up the job
  (title) and its items.
- Shows the **profiles in that one run only** — equivalent to selecting just that
  run's label — using the same table component, **plus a `Status` column** (the
  `scoring_job_items.status` for that profile in that run: done / scoring /
  resolving / failed / skipped / pending). A small header shows the run title +
  "← All profiles".
- The `Status` column appears **only** in this single-run view (status is
  run-specific; the general list has none).

Data: a `listProfilesForJob(jobId)` helper — the job's `scoring_job_items` (status
+ evaluationId) joined to the same per-profile enrichment as `listScoredProfiles`
(source/scores/rank/badges/company/cost/charge/claimer/linkedin), returning rows
that also carry `status`. **Phase A shows only items that have a linked
evaluation** (scored); a small sub-header notes the count of still-unresolved /
pending items in the run, if any (those have no profile row to render yet). The
`ScoredProfileRow` shape is reused; the row type gains an optional `status`.

## Component changes (`ProfilesScoredTable`)

- Accept the rows with `runs[]` (and optional per-row `status`).
- Render run pills in the Source cell (linking to `/admin/profiles/<jobId>`).
- Add the **Filter** control (label checkboxes + all/none) — client state filtering
  the sorted rows.
- Add an optional **Status** column, shown when a `showStatus` prop is true (the
  single-run view passes it).
- Everything else (sorting, badges toggle, CSV export, LinkedIn, zebra, etc.)
  unchanged. CSV export reflects the **current filtered + sorted view**.

## Out of scope (Phase B)
- Moving the live progress bar + localhost cron auto-driver into `/admin/profiles`.
- Moving "+ New Bulk Scoring Job", "Re-Run All", and the Spend dashboard.
- Deleting `/admin/score` and `/admin/score/[id]`.
- Query-param persistence of ad-hoc multi-label filters.

## Testing
- `listScoredProfiles`: extend the existing test to assert `runs[]` is populated
  for a bulk-linked eval (seed an eval + scoring_job + scoring_job_item, assert
  the run title appears).
- `listProfilesForJob(jobId)`: seed a job + items (some scored, varied statuses) +
  evals; assert it returns the run's profiles with the right `status` and enrichment.
- Filter logic (label → visible) is a pure function — unit-test it.
- UI (pills, filter control, status column, single-run route) — manual smoke.

## Risks / notes
- No DB migration; all additive reads. Safe to ship without a prod schema change.
- A profile in many runs → many pills; acceptable (rare; wraps).
- `/admin/score` remains the source of truth for live job progress until Phase B.

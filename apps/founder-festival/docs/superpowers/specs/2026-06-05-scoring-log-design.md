# Scoring Log — design

**Date:** 2026-06-05
**Branch:** `worktree-admin-3005`
**Author:** brainstormed with DROdio

## Goal

Two related changes to the profile page super-admin tooling:

1. **Consolidate the admin pill.** Move Hide / Delete into the fixed top-right
   admin pill so it reads `Admin:  Scoring Log | Re-Score | Hide | Delete`, all
   rendered as inline hyperlinks.
2. **Persist scoring history.** Record an immutable snapshot of every scoring
   run so a super-admin can see how a person's score changed over time. The
   "Scoring Log" link opens a table (one row per run, with date); clicking a row
   opens the existing Score Detail view rebuilt from that run's snapshot.

## Background / current behavior

- Scoring is computed in `src/lib/eval-pipeline.ts`. Two write paths:
  - `runEval()` — first score (URL or bulk cron); INSERTs an `evaluations` row.
  - `reEvaluate()` — re-score; **UPDATEs the `evaluations` row in place**.
  Both call `computeFreshScore()` → a `payload`, then `payloadToWriteFields()`,
  then write. Cached hits (`lookupCachedEval`) do not recompute.
- Because re-score overwrites in place, **all prior scores are discarded today.**
- The Score Detail UI (`src/components/ScoreDetailButton.tsx`) takes a flat set
  of props (founder/investor breakdown, the three scores, signal quality,
  company stage, source/sourceCode, grounding, profile, recommendations,
  timestamps) and renders a modal.
- The admin pill `src/components/AdminProfileBox.tsx` is `position:fixed`
  top-right, shown when `showScoreDetail = isLocalhost || superAdmin`. It
  currently holds `ScoreDetailButton` + an admin `ReScoreButton`.
- Hide / Delete live in `src/components/AdminProfileActions.tsx`, rendered under
  the big score and gated to `superAdmin` only. They POST to
  `/api/admin/profile/[evalId]/hide` and `/delete`.

## Part A — Admin pill consolidation

`AdminProfileBox` becomes the single home for super-admin profile actions,
rendered as inline gold `.link` hyperlinks separated by ` | ` (separators owned
by the pill shell, interleaved between children):

```
Admin:  Scoring Log | Re-Score | Hide | Delete            ✕
```

- Rename the `ScoreDetailButton` trigger label **"Score Detail" → "Scoring
  Log"** everywhere it appears (profile pill + `/not-this-round`).
- Move Hide + Delete into the pill; remove the old in-page `AdminProfileActions`
  row. Keep the component's logic (optimistic hide toggle + `router.refresh()`,
  delete confirmation modal, Show/Hide label flip) but render its triggers as
  `.link` hyperlinks suitable for the pill.
- **Gating inside the pill:** Scoring Log + Re-Score keep the existing
  `showScoreDetail` (localhost OR superAdmin) condition. Hide + Delete render
  only when `superAdmin`. APIs remain super-admin-gated server-side regardless.
- The pill's separators must not render a trailing/leading `|` when Hide/Delete
  are absent (localhost-non-superadmin sees just `Scoring Log | Re-Score`).

## Part B — Scoring history persistence

### New table `scoring_runs`

| column            | type          | notes                                        |
|-------------------|---------------|----------------------------------------------|
| `id`              | uuid pk       | `defaultRandom()`                            |
| `evaluation_id`   | uuid          | FK → `evaluations.id`, `ON DELETE CASCADE`   |
| `founder_score`   | integer       | summary column for the table view            |
| `investor_score`  | integer       |                                              |
| `score`           | integer       | combined                                     |
| `signal_quality`  | text          |                                              |
| `company_stage`   | text (null)   |                                              |
| `source`          | text          | `url` / `code` / bulk                         |
| `source_code`     | text (null)   |                                              |
| `model`           | text (null)   | scoring model id, when known                 |
| `cost_total_cents`| integer (null)|                                              |
| `snapshot`        | jsonb         | full payload to rebuild Score Detail         |
| `created_at`      | timestamptz   | `defaultNow()` — the moment of the run       |

Index: `(evaluation_id, created_at desc)`.

`snapshot` holds everything Score Detail needs that is not already a scalar
column: `{ linkedinUrl, breakdown: { founder, investor }, recommendations,
exaGrounding, profile }`. Immutable — a run is a point-in-time fact; later admin
edits to `score_items` never rewrite history.

### Write hook

A helper `recordScoringRun(evalRow, payload)` inserts one `scoring_runs` row.
Called from both `runEval()` and `reEvaluate()` after the evaluation write
succeeds. Best-effort: wrapped in `.catch(() => {})` like `refreshAvgCostStat()`
so a history-write failure never fails a score. Cached hits add no run (correct).

### Backfill (one-time)

`scripts/backfill-scoring-runs.ts` (mirrors existing `scripts/*.ts`, run with
`tsx --require dotenv/config`). Seeds one `scoring_runs` row per existing
evaluation from its current columns, `created_at = evaluations.updated_at`.
Idempotent: skip evaluations that already have any `scoring_runs` row.

### Migration

Additive only. Generate the drizzle migration file (`npm run db:generate`) for
history, but apply via idempotent direct SQL (`CREATE TABLE IF NOT EXISTS` /
`CREATE INDEX IF NOT EXISTS`) using `DATABASE_URL_UNPOOLED` (dev) — never
`db:push`. **Prod is applied separately at deploy time by DROdio** (this branch
is not being deployed yet). In this repo's `.env.local`, `DATABASE_URL*` → dev
(ep-old-shadow), `POSTGRES_URL*` → prod (ep-fragrant-surf).

## Part C — Scoring Log view

Clicking **Scoring Log** opens a modal with a **table, newest first**:

| Date | Founder | Investor | Combined | Signal | Cost |
|------|---------|----------|----------|--------|------|

- Each row is clickable → opens the existing Score Detail view, rebuilt from
  that run's `snapshot` + summary columns.
- Two-level modal: list ⇄ detail with a back affordance; same dark chrome.
- Data via a new super-admin-gated `GET /api/admin/profile/[evalId]/scoring-runs`
  returning the rows (summary columns + snapshot). Detail needs no second fetch.

### Component refactor

Extract the detail panel of `ScoreDetailButton` into a presentational
`ScoreDetail` (props in, no fetching), so it can be rendered for both the live
score and any historical run. `ScoreDetailButton` keeps owning the live trigger;
the Scoring Log modal renders `ScoreDetail` for a selected run.

## Testing

- Unit: snapshot round-trips (payload → `scoring_runs` row → `ScoreDetail`
  props); backfill idempotency (running twice inserts once).
- The write-hook best-effort wrapper swallows failures (does not throw).

## Out of scope / YAGNI

- Per-run `score_items` history table (the `snapshot` blob covers the breakdown).
- Recovering pre-existing lost re-score history (unrecoverable; backfill seeds
  one row from the current score).
- Surfacing the log to non-admins.

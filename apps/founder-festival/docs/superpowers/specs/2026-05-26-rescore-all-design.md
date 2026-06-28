# Re-score all profiles (bulk re-run) — design

**Date:** 2026-05-26
**Branch:** `events-v1`
**Status:** approved (design), pending spec review

## Goal

Give an admin a one-click way to re-score **every** profile using the current
scoring pipeline. The bulk run must reuse the exact per-profile mechanism
(`reEvaluate`) — no duplicated scoring logic — so it automatically picks up all
current and future scoring behavior (Exa grounding, double-verification, rubric
prompt-caching, etc.).

## Key principle: reuse, don't duplicate

A "re-score all" is just a **scoring job whose items are all existing
profiles**. The existing cron worker (`/api/cron/scoring-tick`) already calls
`reEvaluate(evaluationId, { model })` for any job item that carries an
`evaluationId` (vs. `runEval` for fresh items). So we only need a new way to
*populate* a job — execution, progress UI, cost tracking, throttling
(`ITEMS_PER_TICK`), failure handling, and the per-job "Re-run" button all come
for free from the existing jobs system.

## Components

### 1. `POST /api/admin/rescore-all` (new)

- **Auth (hard requirement):** `if (!(await isAdmin())) return 403`. `isAdmin()`
  already counts only **verified** emails (PR #46), so a forged/unverified admin
  email can't pass. This is the real gate — the UI button is just convenience.
- **Body:** `{ model: "sonnet" | "opus" }`, validated with `isScoringModel`
  (400 on bad value).
- **Scope:** all evaluations with `source = "url"` (the AI-scored profiles).
  Excludes `source = "code"` rows (manually-entered scores — re-scoring would
  clobber them; there are currently 0). Each must have a non-null `linkedinUrl`.
- **Creates:**
  - one `scoringJobs` row: `title = "Re-score all profiles — <YYYY-MM-DD>"`,
    `model`, `status = "queued"`, `totalItems = <count>`,
    `estimatedCents = await estimateJobCents(count, model)` (tuned median of
    recent actuals — appropriate now that per-eval cost is higher/variable),
    `createdByEmail` from the Clerk session.
  - one `scoringJobItems` row per eval: `jobId`, `evaluationId`,
    `linkedinUrl` (the eval's URL), `inputRaw` (eval's fullName ?? URL),
    `status = "resolved"` (skips handle-resolution, goes straight to scoring).
  - Inserted in chunks (e.g. 100/insert) to stay clear of any param-count cap.
- **Returns:** `{ jobId }`. 409/empty-friendly if there are 0 eligible profiles
  (`{ jobId: null, count: 0 }` and the UI alerts "no profiles to re-score").
- Does **not** run the work inline (would exceed the 60s function limit). The
  job is `queued`; the cron tick (prod) or the job page's localhost auto-driver
  picks it up.

### 2. `RescoreAllButton` (new client component)

- Lives in the **jobs table `<thead>`**, in the last column (right-aligned),
  directly above the per-row "Re-run" buttons — an "apply to all" affordance.
- Renders a compact model `<select>` (Sonnet / Opus, default Sonnet) + a
  **"Re-Run All"** button.
- On click: `window.confirm(...)` showing the profile count and the estimated
  cost **for the selected model** (per-model per-profile cents + count passed in
  as props so the message is accurate without a round-trip). Mirrors the
  existing `RerunButton` "spends real money" confirmation.
- POSTs `{ model }` to `/api/admin/rescore-all`; on success
  `router.push("/admin/jobs/<jobId>")` (localhost auto-driver starts it). On
  error, `alert()` with the server message. `busy` state disables during the
  request.

### 3. Wire into `/admin` (`src/app/(authed)/admin/page.tsx`)

- Pass the eligible-profile **count** and the per-model estimate cents into the
  page (server-side: `getEstimateCents("sonnet")` / `("opus")` and a
  `count(*)` of `source="url"` evals).
- Render `<RescoreAllButton>` in the jobs table's trailing header `<th>`.
- The page itself is already admin-gated via `adminGate()`.

## Security (explicit requirement)

Every money-spending endpoint must enforce **verified-admin server-side** — the
UI is never the gate:

| Endpoint | Action | Auth | Status |
|---|---|---|---|
| `POST /api/admin/rescore-all` | re-score all | `isAdmin()` → 403 | **new — add** |
| `POST /api/admin/jobs/[id]` | re-run one job | `isAdmin()` → 403 | already gated ✓ |
| `POST /api/admin/jobs` | create job | `isAdmin()` → 403 | already gated ✓ |
| `POST /api/rescore` | re-score one eval | owner-or-admin → 403 | already gated ✓ |

No change needed to the existing three beyond confirming coverage (done). The
new endpoint copies the `isAdmin()` pattern.

## Cost & safety

- Cost preview uses the **tuned** `estimateJobCents()` (median of recent actual
  totals), not flat constants — important because founder-signals raised and
  widened per-eval cost.
- Confirmation dialog before any spend.
- Double-click creates two jobs (consistent with New Job); acceptable for v1, no
  locking.

## Testing

- Unit/integration (Vitest, hits the test Postgres like the existing job tests):
  - `rescore-all` creates a job + N items with `status="resolved"` and each
    item's `evaluationId` set, for `source="url"` evals only.
  - returns 403 when not admin (mock `isAdmin` → false).
  - returns 400 on invalid model.
  - 0 eligible profiles → `{ jobId: null, count: 0 }`, no job row created.
- Manual: click "Re-Run All" on localhost → job page → auto-driver re-scores;
  confirm items go through `reEvaluate` (scores update in place, costs recorded).

## Out of scope (v1)

- Selecting a subset of profiles (always all `source="url"`).
- De-duping against an already-running re-score-all job (no lock).
- Re-scoring `source="code"` profiles.
- Scheduling / recurring bulk re-scores.

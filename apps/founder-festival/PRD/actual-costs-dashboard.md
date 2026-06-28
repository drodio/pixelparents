# Branch: `actual-costs-dashboard` — full cost-visibility build

This branch makes admin spend tracking truthful end-to-end. Today the
`/admin` dashboard prints fictional cost numbers (hardcoded constants),
and a large portion of real spend is captured nowhere at all. This
branch fixes that by surfacing real-source actuals from Vercel AI
Gateway and Exa, instrumenting the currently-silent code paths,
splitting LLM vs Exa cost in the UI, and using observed actuals to
auto-tune future estimates.

The work happens in this worktree, on this branch, isolated from the
main checkout. You — the agent picking this up — have full latitude
over implementation details. Decisions, defaults, and recommendations
below are starting points, not orders. If you see a better path, take
it; just log the decision in this file with your reasoning.

---

## What the operator wants (verbatim)

> "When I go to Vercel, my AI dashboard says I've only spent $0.82
> total, but my local /admin Dashboard says I've spent much more.
> Where is that spend happening?"

> "I'd like you to be pulling and showing the actual real costs.
> When you show actual cost in the admin dashboard, I'd like you
> to show it from the Vercel AI as well as the Exa costs and break
> them out separately. Can you create a new branch for this work
> and pull from the actual sources for the actual costs? And then
> let's also work to improve the estimates based on actuals so
> that future estimates are going to be more accurate."

> "I want to do all the cost stuff including Exa in this new
> worktree."

So the scope here is **everything cost-related** — Vercel + Exa,
historical untracked spend, dashboard UI, estimate tuning.

---

## Audit of today's state (what's broken / silent / fake)

A separate agent audited every paid call site. Findings:

1. **`/api/rescore` spends real money and records nothing.** It calls
   `reEvaluate()` which runs the full Claude + Exa pipeline, but the
   route isn't a bulk job and never writes a `scoring_job` row. The
   spend hits Vercel and Exa accounts but never appears on `/admin`.
   - File: `src/app/api/rescore/route.ts:32`
   - Calls: `reEvaluate(body.evaluationId)` → `src/lib/eval-pipeline.ts:460`
2. **`/api/eval` spends real money and records nothing.** Same shape
   as rescore — calls `runEval(url, "url")` for live single evals from
   the splash flow. No job, no cost row.
   - File: `src/app/api/eval/route.ts:43`
   - Calls: `runEval(url, "url")` → `src/lib/eval-pipeline.ts:438`
3. **All Exa spend is silent.** Every eval calls Exa 3–4 times
   (`researchLinkedinProfile` does 1 search + 1 getContents; the
   `exa-domain.ts` enricher adds 1 more search; handle resolution
   for "name, company" pastes adds another search). Nothing is
   counted in the DB, no column tracks it.
   - Call sites: `src/lib/exa.ts:31,48`, `src/lib/find-linkedin-handle.ts:36`,
     `src/lib/enrichers/exa-domain.ts:27`
4. **The bulk-job "actual" cents is a hardcoded constant, not
   metered.** `/api/cron/scoring-tick` increments `actualCents` by a
   flat 35¢/eval (Opus) or 13¢/eval (Sonnet) regardless of what the
   call actually cost.
   - File: `src/app/api/cron/scoring-tick/route.ts:110`
   - Constants: `src/lib/admin.ts` (`COST_PER_EVAL_CENTS`,
     `HANDLE_RESOLVE_CENTS`)
5. **The real per-eval Claude cost IS already computed — and then
   ignored.** `computeScoringCostUsd` reads `usage.inputTokens /
   outputTokens / cachedInputTokens` and applies
   `MODEL_PRICING_USD_PER_1M`. The result is stored at
   `evaluations.profile.usage.costUsd`. But nothing aggregates that
   field or surfaces it in admin; the job-level `actualCents` rollup
   uses the flat constant instead.
   - File: `src/lib/eval-pipeline.ts:93,106,222,373`
6. **NFX/Apify scraper is dead code.** Imported in the enrichers
   index but not wired into the pipeline. If/when it ships, it's a
   silent paid path waiting to happen. Worth a guard.
   - File: `src/lib/enrichers/nfx.ts`

So today: bulk jobs report fictional numbers, single evals and
rescores report nothing, Exa reports nothing, and the one piece of
real cost data we already compute (`costUsd`) is dropped on the floor.

---

## What's already on `main` to build on

You do not have to start from scratch. The foundation is here:

- `MODEL_PRICING_USD_PER_1M` — Anthropic published prices for Sonnet
  & Opus, broken down into `input` / `output` / `cachedRead` per 1M
  tokens. (`src/lib/eval-pipeline.ts:93`)
- `computeScoringCostUsd(model, usage)` — pure function: token
  counts in, USD out, accounting for prompt caching.
  (`src/lib/eval-pipeline.ts:106`)
- `ScoringUsage` type — `{ model, inputTokens, outputTokens,
  cachedInputTokens, costUsd }`. (`src/lib/eval-pipeline.ts:99`)
- `evaluations.profile.usage` — already populated on every successful
  eval with the `ScoringUsage` blob.
- `evaluations.pricing` JSONB column — exists, defaults to `{}`,
  currently unused. Free for you to use as the per-eval cost-summary
  blob if a separate column is cleaner than nesting under `profile`.
  (`src/db/schema.ts:48`)
- `scoring_jobs.estimated_cents` / `actual_cents` columns — already
  defined. (`src/db/schema.ts:214,215`)

In short: the LLM cost-per-eval math is solved; what's missing is
(a) Exa instrumentation, (b) live remote-source pulls, (c) UI, and
(d) estimate auto-tuning.

---

## The two real-source APIs (confirmed, ready to call)

### Vercel AI Gateway

- **`GET https://ai-gateway.vercel.sh/v1/credits`** — account-wide
  rolling totals. Returns `{ balance, total_used }` as USD strings.
  Auth: `Authorization: Bearer ${AI_GATEWAY_API_KEY}` (the env var
  is already set). No new key needed.
- **`GET https://ai-gateway.vercel.sh/v1/generation?id=<gen_id>`** —
  per-call breakdown: `total_cost` (USD), `tokens_prompt`,
  `tokens_completion`, `native_tokens_cached`, `model`,
  `provider_name`, `created_at`. Generation IDs come back from
  `generateObject` in the response (`providerMetadata` or response
  `id`). Only useful if you persist gen IDs per eval; otherwise
  skip and rely on `/credits` + locally-computed per-eval cost.
- Caveat: `generateObject` uses tool-calling mode by default, which
  breaks Anthropic prompt caching. See vercel/ai#5227. Worth
  measuring `cachedInputTokens` to confirm cache is hitting; if it's
  always 0, that's the issue and a switch to `generateText` with
  manual JSON parse may pay for itself.

### Exa

- **`GET https://admin-api.exa.ai/team-management/api-keys/{id}/usage`** —
  authoritative billing per key. Returns `total_cost_usd` plus
  `cost_breakdown[]` per price_id. Params: `start_date`, `end_date`
  (ISO 8601, 180-day lookback limit), optional `group_by`.
  - **Auth:** `x-api-key` header — requires a **service key**,
    distinct from `EXA_API_KEY`. Operator needs to provision one in
    the Exa dashboard.
  - **Recommended approach:** build the counts-based path first
    (works without the service key), and fall through to this API
    if `EXA_SERVICE_KEY` env var is set. That way the dashboard is
    accurate immediately and gets more accurate later.
- **Published pricing for the counts-based fallback** (current as
  of 2026):
  - `exa.search` keyword & neural: **$7 / 1,000 requests** (10
    results included; +$1 / 1k for each additional result above 10)
  - `exa.getContents` full page: **$1 / 1,000 pages per content
    type**
  - Highlights returned alongside search: **free** (≤10 results)
  - Summaries: $1 / 1k pages
  - Exa Deep: $12 / 1k (not used today)
  - Free tier: 1,000 requests/month

---

## Operator's stated preferences (with your room to override)

The operator already expressed a preference for **option 3** on the
Exa actuals question:

> "Build the counts path now so the dashboard works today. Make the
> code fall through to the Exa API if EXA_SERVICE_KEY is set."

On the estimate-tuning window: **last 20 evals, per model**, falling
back to current flat constants when there are fewer than 5 samples
for that model. Median is probably better than mean here — one
runaway eval shouldn't pull the estimate up.

On per-job UI: **split breakdown** — show LLM cost, Exa cost
(research + handle-resolve), and total per job, with item-level
rows in `/admin/jobs/<id>` showing the same split.

You can override any of these if you have better data, but log the
reasoning in this PRD.

---

## Scope of work (the build)

These are the pieces, ordered roughly by dependency. Cut any of them
that you decide aren't worth it, but don't expand scope without
asking.

### 1. Instrument Exa calls (foundation)

Wrap `getExaClient()` (or every call site directly) so each `search` /
`getContents` call increments a counter that the caller can read at
the end of the operation. Two reasonable shapes:

- **Per-call return:** every wrapper returns `{ result, exaCost: {
  searches, contentFetches, costUsd } }`. Callers accumulate.
- **Async-context counter:** Node's `AsyncLocalStorage` to attach a
  counter to the eval's async context; call sites push into it
  transparently. Less boilerplate at call sites, more magic.

Recommendation: **per-call return**, because it makes the cost flow
visible in the type system and easier to test. AsyncLocalStorage is
cute but the eval pipeline is shallow enough that explicit threading
is fine.

Either way: define `ExaUsage = { searches: number; contentFetches:
number; costUsd: number; numResultsOver10: number }` (the last field
tracks the +$1/1k overage for searches that request >10 results).

### 2. Compute and persist per-eval Exa cost

In `runEval` / `reEvaluate`, accumulate `ExaUsage` from each call
site (research, handle-resolve, exa-domain enricher) and stash it
on the persisted row. Either:

- Add a typed shape to `evaluations.profile` alongside the existing
  `usage` (Claude tokens):
  ```ts
  profile: {
    usage: ScoringUsage,        // existing — Claude
    exaUsage: ExaUsage,         // new
    ...
  }
  ```
- OR use the empty `evaluations.pricing` JSONB column for a single
  flat cost summary: `{ llm: ScoringUsage, exa: ExaUsage,
  totalUsd: number }`. Cleaner for aggregation queries; doesn't bury
  cost data inside a heterogeneous `profile` blob.

Recommendation: **use the `pricing` column**. It already exists,
the name fits, and SUM aggregations are simpler when cost data isn't
co-mingled with profile data.

### 3. Fix the silent paths (`/api/rescore`, `/api/eval`)

Both routes today call into the pipeline and discard the cost. With
step 2 in place, the cost lands in `evaluations.pricing` on every
write — so the silent paths become tracked automatically. No special
handling needed beyond making sure `reEvaluate` and `runEval` both
flow through `payloadToWriteFields` which writes the pricing column.

Verify both routes by running an eval through each and confirming
the row's `pricing` column populates.

### 4. Fix the bulk-job aggregator

`/api/cron/scoring-tick/route.ts:110` should stop incrementing
`actualCents` by a flat constant. Instead:

- After `runEval` returns its `evaluationId`, read the persisted
  `pricing.totalUsd` (or compute from `profile.usage` + `exaUsage`)
  and increment the job's `actualCents` by the real value.
- Handle-resolve cost (when the cron resolves a name+company →
  LinkedIn URL via Exa) needs to count too — add an Exa search to
  the per-item cost.

### 5. Live remote-source dashboard pull

New module `src/lib/spend/`:
- `vercel-ai-gateway.ts` — `getVercelCredits()` calls `/credits`,
  returns `{ balanceUsd, totalUsedUsd, fetchedAt }`. Cache 60s
  in-memory to avoid hammering the endpoint on every dashboard hit.
- `exa-usage.ts` — `getExaUsage(range)` returns `{ totalUsd,
  byCategory, source: "api" | "counts" }`. If `EXA_SERVICE_KEY` is
  set, hits the admin-api endpoint. Otherwise sums
  `evaluations.pricing.exa.costUsd` over the requested range.

Both modules surface errors as typed results rather than throwing;
the dashboard should degrade gracefully (`"Vercel API
unreachable"` rather than a 500).

### 6. Admin UI

Two UI updates:

- **`/admin` index page** gets a top section: "Spend (last 30 days)"
  showing three cards — **Vercel AI Gateway** (with the
  remote-source totalUsed and a note "live from
  ai-gateway.vercel.sh"), **Exa** (with totalUsd, source badge
  reading "computed from counts" or "live from admin-api.exa.ai"),
  and **Total**. Below the cards, the existing jobs table — but its
  "Est / Actual" column now shows real numbers.
- **`/admin/jobs/<id>`** detail page gets a per-item cost column:
  `LLM $X.XX · Exa $X.XX`. Job-level totals at the top.

### 7. Estimate auto-tuning

Replace `COST_PER_EVAL_CENTS` / `HANDLE_RESOLVE_CENTS` constants
(in `src/lib/admin.ts`) with a function `getEstimateCents(model)`
that:

- Queries the last 20 completed evals for that model from
  `evaluations.pricing.totalUsd`.
- Returns the **median** in cents.
- Falls back to the current flat constant if fewer than 5 samples
  exist for that model.

Call this from the form preview in `src/components/admin/NewJobForm.tsx`
and from `estimateJobCents`.

### 8. Schema migration

You'll likely want one Drizzle migration that does either:
- Just documents that `evaluations.pricing` is the canonical
  cost-summary column (no schema change, just stop ignoring it).
- OR adds typed sub-columns for fast SUM aggregation (e.g.
  `evaluations.cost_total_cents`, `evaluations.cost_llm_cents`,
  `evaluations.cost_exa_cents`). Simpler queries, but redundant
  with the JSONB.

Recommendation: **add three integer cents columns** —
`cost_llm_cents`, `cost_exa_cents`, `cost_total_cents` — alongside
the existing `pricing` JSONB. Integer columns make the admin
aggregation queries trivial; the JSONB keeps the full breakdown.
Don't drop `pricing`; it's free typed metadata.

---

## What NOT to do

- Don't refactor the eval pipeline beyond what cost tracking
  requires. Don't restructure `eval-pipeline.ts`. Don't move things
  around for tidiness.
- Don't add a "cost alerts" system, threshold warnings, or budget
  caps. Out of scope. Keep the dashboard read-only.
- Don't write tests for the UI layer beyond what's already
  conventional in the repo. Logic functions (Exa cost calc, estimate
  tuner, pricing math) get vitest coverage; React components don't.
- Don't add a third LLM provider, a new model, or rate limiting.
- Don't try to back-fill historical Exa cost for evals that ran
  before this branch — the data isn't recoverable. Show "—" for
  pre-instrumentation rows and a one-line note in the UI.

---

## Suggested ramp-up order

1. Read this file and `CLAUDE.md` / `AGENTS.md` at the repo root.
2. Read `src/lib/eval-pipeline.ts` end-to-end — that's where most
   of the cost flows.
3. Read `src/lib/exa.ts`, `src/lib/find-linkedin-handle.ts`,
   `src/lib/enrichers/exa-domain.ts` to inventory every Exa call.
4. Skim `src/app/(authed)/admin/page.tsx` and `src/app/api/cron/scoring-tick/route.ts`
   so you know what the admin UI looks like and where job-level
   `actualCents` gets incremented.
5. Build in the order above (1 → 7). Migration (8) goes whenever
   you need the new columns.
6. Manual smoke test: run an eval via `/api/eval`, a rescore via
   `/api/rescore`, and a bulk job. Confirm `evaluations.pricing`
   populates on all three and the admin dashboard shows real
   numbers.
7. Open a PR against `main`. The operator merges PRs themselves —
   don't auto-merge.

---

## Open questions you may need to bring back to the operator

- **Exa service key**: if you want the live-from-admin-api path to
  work, the operator needs to provision a service key in the Exa
  dashboard and add `EXA_SERVICE_KEY=...` to `.env.local` and
  Vercel env. The counts-based path works without it; the API path
  is a one-line config away once they create the key.
- **Date range on the dashboard cards**: default to "last 30 days"
  or "all time"? Vercel's `/credits` returns lifetime totals; Exa's
  usage API takes a range. Pick a default and document it.
- **Should `/api/eval` (the splash-page live eval flow) ALSO get a
  `scoring_jobs` row** so it shows up in the jobs list? Or just
  rely on the per-eval `pricing` column being populated and let the
  jobs table only show bulk jobs? The operator's audit summary
  flags `/api/eval` as "invisible" — clarify whether they want a
  pseudo-job row for it.

---

## Progress Update as of 2026-05-26 02:41 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Identified and prepped the real production database, then merged main into this
branch. The cost columns lived only in the local dev DB (`ep-old-shadow`); prod
is a separate Neon DB (`ep-fragrant-surf`, aka "neon-canary-paddle" on Vercel)
that lacked them — so merging PR #26 would have 500'd live evals. Applied the 3
nullable cost columns to prod directly, then merged 25 commits of `main` and
re-numbered our migration to resolve the drizzle collision.

### Detail of changes made:
- **Prod DB confirmed + migrated.** Prod = `ep-fragrant-surf-aqyi9p6w` (distinct
  from local dev `ep-old-shadow`); corroborated as prod because it's the host the
  Neon Auth integration in `.env.local` points to, and it holds real data (22
  evals, 3 users, full schema). It was missing `cost_llm_cents`/`cost_exa_cents`/
  `cost_total_cents`. Applied all three as nullable integers via raw
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (NOT `drizzle-kit push` — prod has
  pre-existing schema drift that push would try to "fix" destructively). Verified
  present afterward. Prod is now safe for the PR #26 deploy.
- **Merged `origin/main` (25 commits).** Only conflicts were drizzle metadata.
  Both branches had created a `0003`: ours `0003_early_morgan_stark` vs main's
  `0003_hard_hydra` + `0004_right_chronomancer`. Resolved by taking main's journal
  + snapshots, deleting our orphaned `0003_early_morgan_stark.sql`, and
  regenerating our migration as `0005_sturdy_hydra.sql` (the same 3 ADD COLUMNs)
  so it diffs cleanly against main's latest snapshot. `schema.ts`, `eval-pipeline.ts`,
  and `JobProgress.tsx` auto-merged with our cost columns intact.
- Post-merge health: `tsc --noEmit` clean, all 134 vitest tests pass.

### Potential concerns to address:
- **No auto-migrate on deploy.** Prod schema is applied manually (there's no
  migrate step in build/deploy — that's why the columns had to be added by hand).
  The `0005` migration file is a repo record, not something prod auto-runs; prod
  was synced manually. Future schema changes need the same manual application to
  `ep-fragrant-surf` before/with deploy.
- **"Push dev users to prod" still open.** Clerk dev and prod are separate
  instances, so user IDs may not map between the dev (`ep-old-shadow`) and prod
  (`ep-fragrant-surf`) databases. Not yet resolved.
- Merging PR #26 deploys to prod; prod now has the columns, so live evals are safe.

---

## Progress Update as of 2026-05-25 07:38 PM Pacific

### Summary of changes since last update
Broadened Re-run to whole-job re-runs (incl. successfully-completed jobs). The
button now shows for any terminal job (completed/failed/cancelled), not just
ones with failures. `POST /api/admin/jobs/[id]` now re-queues ALL finished items
(done/failed/skipped), keeps their evaluationId, and resets the job's
actual_cents to 0. The cron forces a fresh re-score via `reEvaluate(evalId)` when
a claimed item already has an evaluationId (otherwise `runEval` would just return
the URL cache); fresh items still use `runEval`. `RerunButton` now confirms first
(`Re-run all N items? … spends real money`) since re-running a completed job
re-scores everything. The global recorded total stays correct because reEvaluate
overwrites each eval row's cost in place (no double-count).

## Progress Update as of 2026-05-25 07:24 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added a per-job **Re-run** action on `/admin`. New `POST /api/admin/jobs/[id]`
re-queues a job's failed/skipped items (name+company → "pending" to re-resolve;
items with a URL → "resolved" to skip to scoring), recomputes the job's
done/failed counters, and flips the job back to "queued". `RerunButton` (client)
posts then navigates to `/admin/jobs/<id>`, where the localhost auto-driver
processes them. The button shows in a new Actions column only when a job has
failed/skipped items (`failedItems > 0`). Combined with the handle-resolution
fix, this lets the operator retry the 7-founder job in one click. Also converted
the two `/admin/jobs/new` `<a>` links to `next/link` (clears the pre-existing
no-html-link-for-pages lint errors in that file). Validated the re-run SQL
executes; tsc/eslint/tests all clean (134 passing).

## Progress Update as of 2026-05-25 07:12 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Cosmetic: added a small inline spreadsheet/grid SVG icon to the "Upload CSV"
button on `/admin/jobs/new` (inherits currentColor, sits left of the label).

## Progress Update as of 2026-05-25 07:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed handle resolution returning "no LinkedIn match found" for everyone (a job
of 7 well-known YC founders skipped all 7). Root cause (found by probing Exa
live): the query used Google's `site:linkedin.com/in/` operator with
`type: "keyword"`, but **Exa doesn't support `site:`** (matched as literal text
→ 0 results), and keyword search ranks posts/articles above profiles. Switched
`find-linkedin-handle.ts` to `type: "auto"` + `includeDomains: ["linkedin.com"]`
with a plain `"<name> <company> founder profile"` query, and bumped
numResults 8→10. Verified live: the same 7 founders now resolve 7/7 to real
`/in/` profiles.

NOTE: the already-skipped job won't reprocess (skipped items are terminal) —
re-run those names as a NEW job.

## Progress Update as of 2026-05-25 06:50 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added CSV drop/upload to `/admin/jobs/new`. New pure module
`src/lib/csv-to-lines.ts` (`parseCsv` — quote/comma/newline-safe; `csvToJobLines`
— header detection for name / first+last / company / linkedin-url columns, with
a positional fallback) converts a CSV into the textarea's existing line format
("Name, Company" or URL per line), so the parse/estimate/submit flow is
unchanged. 15 vitest cases. `NewJobForm` gained a drag-drop zone over the
textarea + an "Upload CSV" picker that appends the converted rows and shows a
confirmation note. Also escaped a pre-existing unescaped-quote lint error in
that file while editing it.

## Progress Update as of 2026-05-25 06:34 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Local-dev convenience: the job progress page (`JobProgress`) now drives the
worker itself — while a job is queued/running it fires one
`/api/cron/scoring-tick` at a time (guarded by a ref so ticks never overlap and
double-claim) until the job completes. Gated to localhost; on prod the client
isn't an authorized cron caller, so Vercel's real cron does the work. This makes
"create a job → watch it process" work locally without manually curling the
worker. Also renamed the new-job heading "New scoring job" → "Score Founders &
Investors".

## Progress Update as of 2026-05-25 06:25 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed a **pre-existing** 500 in `POST /api/admin/jobs` (surfaced while testing
job creation, unrelated to cost work): the name-dedupe query used
`sql\`lower(full_name) = ANY(${namesInPaste})\``, which the neon-http driver
expands into a param tuple rather than an array → "op ANY/ALL (array) requires
array on right side". Replaced with `inArray(sql\`lower(full_name)\`,
namesInPaste)` (builds `IN (...)`, matching how the URL path already dedupes).
Only the "Name, Company" paste path hit it; URL-only pastes were unaffected.
Verified the corrected query executes read-only against prod.

## Progress Update as of 2026-05-25 06:14 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Pivoted ACTUAL cost from internally-computed estimates to **real, source-
reported costs**, per operator direction ("estimates are fine, but actual
cost must come from real sources"). Verified live against prod.

### The key discovery
Both sources return the real charged cost **inline in each response** — no
service key, no extra API calls:
- **Exa**: every search/getContents response carries `costDollars.total`
  (confirmed in exa-js 2.13.0 types and against the live API).
- **LLM**: `generateText` result `providerMetadata.gateway.cost` is Vercel's
  real per-generation billed amount (confirmed via a live probe; also exposes
  `generationId`). The separate `getGenerationInfo` endpoint errored and is
  not needed.

So the operator does **NOT** need an Exa service key after all — the existing
`EXA_API_KEY` + `AI_GATEWAY_API_KEY` are sufficient for fully real-sourced
actuals.

### Decisions
- **Actual = real, from source.** `searchUsage/contentsUsage` now take an
  optional `realCostUsd` (the response's `costDollars.total`); published-price
  math is only a FALLBACK when a response omits cost. `ScoringUsage` gained
  `costSource: "gateway" | "estimated"` and `generationId`; `scoreWithClaude`
  uses `providerMetadata.gateway.cost` and falls back to token math only if
  absent.
- **Estimate stays internal** (the median-of-actuals tuner) — only the pre-run
  job estimate is "made up," exactly as the operator wanted. And it now tunes
  against real actuals.
- **Two boxes, not three.** Removed the "Recorded total" box. `/admin` now
  shows **Vercel AI Gateway · LLM** and **Exa · search** boxes, each = the
  running SUM of real per-eval actuals (all-time), so every job increments
  them. The LLM box footnotes the Vercel `/credits` lifetime total as a
  reconciliation reference. Both boxes are **clickable** → `/admin/spend`.
- **Drill-down:** new `/admin/spend` (`?source=llm|exa`) lists per-eval cost
  rows (subject, model, LLM, Exa, total, "est" badge when a row fell back to
  the token estimate), sorted by total.
- **Deleted** `src/lib/spend/exa-usage.ts` and `parseExaApiUsage` — the
  counts/admin-api Exa estimate is obsolete now that real per-call cost is in
  the response. (`exa-cost.ts` keeps published prices only as the per-call
  fallback.)

### Detail of changes made
- `exa-cost.ts`: `searchUsage(n, realCostUsd?)` / `contentsUsage(p, realCostUsd?)`
  — real cost wins, estimate is fallback; `0` is honored as real. Tests added.
- `exa.ts`, `find-linkedin-handle.ts`, `enrichers/exa-domain.ts`: pass each
  response's `costDollars.total` into the usage helpers.
- `eval-pipeline.ts`: `ScoringUsage` + `scoreWithClaude` use the gateway's real
  cost; `EvalPricing` (and the `cost_*_cents` columns) therefore now hold real
  actuals. Per-job actual (cron rollup of `cost_total_cents`) and the
  `/admin/jobs/<id>` per-item split are real automatically.
- `spend/recorded.ts`: `getRecordedSpend(days?)` (all-time when omitted) +
  `listEvalCosts(limit)` for the drill-down.
- `(authed)/admin/page.tsx`: two clickable real-actual boxes; `(authed)/admin/spend/page.tsx`: drill-down.
- Live verification on prod: queries execute cleanly; recorded = $0 so far (49
  pre-instrumentation evals excluded), Vercel lifetime $6.36. New evals will
  populate everything.

### Operator action / notes
- Migration `0003` (the 3 cost columns) is already applied to the prod Neon
  branch (done in the prior session, surgically — `drizzle-kit push` is unsafe
  here due to unrelated pre-existing schema drift; see below).
- **No Exa service key needed** (superseded by response `costDollars`).
- **Pre-existing schema drift (unrelated):** `drizzle-kit push` wants to
  add/drop columns beyond ours — do not `--force` it. A separate clean-up
  migration should reconcile `schema.ts` vs the prod DB someday.

## Progress Update as of 2026-05-25 11:48 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implemented the full cost-visibility build end to end (scope items 1–8):
Exa calls are instrumented and their cost persisted per eval, the
silent `/api/eval` + `/api/rescore` paths are now tracked automatically,
the bulk cron bills real cost instead of flat constants, the estimate is
auto-tuned from actuals, and `/admin` shows live Vercel + Exa spend with
a per-item LLM/Exa split on the job page. All pure-logic gets vitest
coverage (TDD); type-checks clean; no new lint errors.

### Decisions made (operator was away; defaults taken per handoff)
- **Exa actuals path:** counts-based now (sum of `cost_exa_cents`),
  falling through to the admin-api when **both** `EXA_SERVICE_KEY` and
  `EXA_API_KEY_ID` are set. The endpoint needs the key id in its path,
  which a bare service key doesn't provide — hence the second env var.
  Documented in `src/lib/spend/exa-usage.ts`.
- **Schema:** added three nullable integer columns (`cost_llm_cents`,
  `cost_exa_cents`, `cost_total_cents`) alongside the `pricing` JSONB
  (full breakdown, source of truth for exact USD). Migration
  `drizzle/0003_early_morgan_stark.sql`.
- **Estimate tuner:** median of the last 20 evals' real total cents per
  model, ≥5-sample minimum, else the flat `COST_PER_EVAL_CENTS`
  fallback. Model is read from `pricing->'llm'->>'model'` (no model
  column on `evaluations`). Pure logic in `src/lib/estimate-tuner.ts`.
- **Date window:** DB-derived cards use **30 days**; the Vercel
  `/credits` card is **lifetime** (the endpoint has no range). The UI
  labels each explicitly.
- **`/api/eval` pseudo-job:** decided **NO**. Single evals and rescores
  are counted via their `pricing`/cents columns and roll into the
  "Recorded total" card, but do **not** get a `scoring_jobs` row — keeps
  the jobs table about bulk operations and avoids write overhead on the
  hot splash path.
- **Handle-resolve cost:** kept job-level only (billed into
  `scoring_jobs.actual_cents` by the cron at the real search rate), not
  folded into `evaluations.pricing`. Keeps `cost_total_cents` a clean
  per-eval figure for the median tuner.
- **"deep" search pricing:** priced at the standard $7/1k (per the
  audit's read that "Exa Deep" is unused). If wrong, the counts-based
  Exa figure is undercounted on the research search only; the admin-api
  path is authoritative regardless. Flagged in `exa-cost.ts`.

### Detail of changes made
- New pure modules + tests: `src/lib/exa-cost.ts` (ExaUsage math),
  `src/lib/estimate-tuner.ts` (median/pick), `src/lib/spend/parse.ts`
  (Vercel/Exa response parsers). Tests: `tests/lib/exa-cost.test.ts`,
  `estimate-tuner.test.ts`, `spend-parse.test.ts`, `spend-vercel.test.ts`.
- Instrumented Exa call sites to return `ExaUsage`: `exa.ts`
  (`researchLinkedinProfile`), `find-linkedin-handle.ts`
  (`findLinkedinHandles`/`resolveLinkedinUrl`), `enrichers/exa-domain.ts`,
  aggregated in `enrichers/index.ts`. Threaded through
  `eval-pipeline.ts` (`ScoredPayload`, `computeFreshScore`) and persisted
  in `payloadToWriteFields` via `buildCostFields` → `pricing` JSONB +
  three cents columns. `EvalPricing` type exported from `eval-pipeline.ts`.
- Cron `scoring-tick`: reads the persisted `cost_total_cents` after
  `runEval` and bills the real resolve-search cost, replacing the flat
  `COST_PER_EVAL_CENTS`/`HANDLE_RESOLVE_CENTS` increments.
- Live spend: `src/lib/spend/{vercel-ai-gateway,exa-usage,recorded}.ts`,
  each returning typed results that degrade gracefully.
- UI: `/admin` gained a "Spend" section (Vercel / Exa / Recorded cards
  with source badges); `/admin/jobs/<id>` gained a per-item LLM+Exa cost
  column and a job-level split; `NewJobForm` now takes tuned per-model
  estimates as props from the (now async) `jobs/new` page.

### REQUIRED before this works in any env with a DB (operator action)
- **Apply the migration:** `npm run db:push` (or apply
  `drizzle/0003_early_morgan_stark.sql`) on the **dev and prod** Neon
  branches. The pipeline writes the new columns on every eval; until they
  exist, evals and the dashboard will error. The pre-commit schema-drift
  guard passes (schema ⇄ migration are in sync).
- **(Optional, for authoritative Exa):** provision an Exa service key and
  set `EXA_SERVICE_KEY` + `EXA_API_KEY_ID` in `.env.local` and Vercel env.
  Without them the dashboard uses the counts-based estimate.

### Potential concerns to address
- **Could not run DB/live smoke tests here:** this worktree has no
  `.env.local` (copying prod secrets in was correctly blocked), so the
  DB-touching vitest suites (`eval-pipeline`, `rate-limit`, `redeem`)
  can't import, and `next build` (which needs generated Next types +
  DB) wasn't run. Pure-logic tests, `tsc --noEmit`, and `eslint` all
  pass. The operator should run an eval via `/api/eval`, a rescore, and
  a bulk job after applying the migration, and confirm `pricing` + the
  cents columns populate and the dashboard cards render.
- **Cache-hit cost attribution (minor):** if the bulk cron hits an
  already-scored URL (rare — job creation dedupes against `evaluations`),
  it reads that row's stored cost and adds it to this job's
  `actual_cents`, slightly over-attributing per-job. The **global**
  "Recorded total" is unaffected (it SUMs distinct eval rows, no double
  count). Left as-is; documented.
- **Prompt-caching question still open:** worth confirming
  `cachedInputTokens > 0` on real evals (the audit flagged
  tool-call-mode breaking Anthropic caching). The pipeline already moved
  off `generateObject` to `generateText`, so caching may now work — but
  the per-eval `pricing.llm` blob now makes this directly observable.
- **Pre-existing lint:** `/admin/page.tsx` `<a>`-to-pages and
  `NewJobForm` unescaped quotes are pre-existing (not introduced here).

## Progress Update as of 2026-05-25 11:20 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Seed entry. Worktree created. This PRD/spec is the complete handoff
to whichever agent picks the branch up.

### Detail of changes made:
- Worktree `.worktrees/actual-costs-dashboard` created off
  `main@f922337`.
- Branch `actual-costs-dashboard` created locally; no upstream yet.
- This PRD file (`PRD/actual-costs-dashboard.md`) committed as the
  seed entry. Contains audit findings, API specs, scope, and a
  suggested build order.

### Potential concerns to address:
- **Exa caching:** the audit notes `generateObject` may break
  Anthropic prompt caching. Worth verifying `cachedInputTokens > 0`
  on observed evals before relying on the cached-read pricing
  discount. If caching is broken, real LLM cost is ~3x higher than
  current estimates assume.
- **Historical data is one-directional:** Exa cost for evals that
  ran before this branch is unrecoverable. Be explicit about this
  in the UI ("—" for older rows) rather than hiding it.
- **PR isolation:** the operator has multiple worktrees / agents
  active. Coordinate before merging — keep this branch focused on
  cost work only.

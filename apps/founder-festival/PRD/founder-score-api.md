# Branch: `founder-score-api` — public Founder Score API

Goal: let outside developers access the Founder Score via an HTTP API. They
register through our existing Clerk auth, generate an API key, and either look
up already-scored people for free or pay (prepaid credits, 10× our measured
cost) to score new people on demand. Plus a developer page (docs + dashboard)
and a downloadable Claude Code instructions file.

Full design: `docs/superpowers/specs/2026-05-26-founder-score-api-design.md`.

## Progress Update as of 2026-05-26 08:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` (54 commits: events-v1, score-table sort, rescore-all,
splash tweaks, email reverification) in prep for shipping to prod. Conflicts were
only the drizzle migration collision + schema.ts:
- **schema.ts:** took main's full schema (events/eventApplicants/etc.) and
  re-appended our `apiKeys` table — both present.
- **Migration renumber:** main's `0007_quick_sway` keeps the 0007 slot; deleted
  our orphaned `0007_curvy_mystique` and regenerated as `0008_mute_skullbuster`
  (CREATE api_keys only — additive, no drops).
- Post-merge: tsc clean; our unit tests (api-keys, score-payload, agent-guide) all
  pass. The 33 `eslint .` errors are pre-existing on main (the codebase's
  `<a href>` / no-html-link-for-pages convention) — not from this work, and they
  don't gate the Vercel build (main ships with them).

### Potential concerns to address:
- **Prod migration:** `0008` (api_keys table) must be applied to the prod DB
  (ep-fragrant-surf) before/with the merge — no auto-migrate on deploy.

## Progress Update as of 2026-05-26 08:20 AM Pacific

### Summary of changes since last update
Key management on /developers: describe + delete keys.
- **Describe:** added a description/label `<input>` to Step 2; `generateKey` now
  sends `{ label }` (the `label` column already existed) and clears it after.
  The key list shows the label.
- **Delete:** new `DELETE /api/developers/keys/[id]` — Clerk-auth'd soft-revoke
  (`revoked_at`), ownership enforced in the WHERE clause (can't revoke others'
  keys), uuid-validated. Each key row in the console now has a Delete button
  (window.confirm first) that revokes then refreshes the list.
- Verified the live endpoint with a real generated key: 200 (scored profile) /
  401 (bad key) / 404 (unknown). tsc + eslint clean; DELETE 401s unauthenticated.

## Progress Update as of 2026-05-26 08:17 AM Pacific

### Summary of changes since last update
Copy tweak: /developers first bullet "Overall, founder & investor scores" →
"Composite + individual founder & investor scores".

## Progress Update as of 2026-05-26 08:16 AM Pacific

### Summary of changes since last update
Developer-page polish + key rebrand from operator feedback:
- **Sign-in returns to /developers** — `DeveloperConsole` now uses
  `forceRedirectUrl`/`signUpForceRedirectUrl: "/developers"` (was landing on home).
- **Developers don't need a phone** — moved the festival "complete your
  membership (email + phone)" banner into a new client `MembershipBanner` that
  hides on `/developers` (API access only needs an email). Wired into `(authed)/layout.tsx`.
- **Returned-items render as real bullets** — `/developers` list switched from a
  marker-less flex `<ul>` to `list-disc`.
- **Vendor-namespaced keys** — `KEY_PREFIX` is now `sk_festival_live_` (was
  `sk_live_`); display prefix = brand + 4 chars. Existing keys still verify (hash-based).
- **Agent-guide top banner** — added an "AI Coding Agent Instructions" block at
  the top of the markdown (Festival.so context; claimed profiles most reliable).

tsc + eslint clean; api-keys + agent-guide tests pass (6).

## Progress Update as of 2026-05-26 08:01 AM Pacific

### Summary of changes since last update
Styled the homepage "Developers" link as a button matching the "Log in" button
(border + padding + rounded-md + translucent bg + backdrop-blur), keeping its
fixed top-left position. tsc clean.

## Progress Update as of 2026-05-26 06:05 AM Pacific

### Summary of changes since last update
Phase 3 frontend: built `/developers` onboarding page (server component) + `DeveloperConsole` client component (sign-in, key generation, key list, agent-guide copy/download) + top-left "Developers" link on the homepage splash. tsc clean, eslint 0 errors (2 pre-existing img warnings on SplashHome untouched by my diff), all 3 smoke tests pass.

### Detail of changes made:
- `src/components/developers/DeveloperConsole.tsx`: "use client" component with `useAuth`/`useClerk`. Shows Step 1 (Register/Sign in button or ✓ signed-in), Step 2 (Generate API key button with 409 guard + raw-key display with copy + warning), active key list, and the `buildAgentGuide` Markdown block with Copy and Download .md buttons. Uses a module-level `loadKeys()` async helper to avoid the `react-hooks/set-state-in-effect` lint rule; one `eslint-disable-next-line` comment needed for the `setKeysLoading(true)` synchronous call before the promise.
- `src/app/(authed)/developers/page.tsx`: server component with page `metadata`, marketing h1 + 7-item returned-fields list, divider, and h2 "Here's how to get started:" above `<DeveloperConsole />`. Uses `next/link` for the home logo link. The "Then just paste this Markdown…" h2 lives inside `DeveloperConsole` above the Markdown block.
- `src/components/SplashHome.tsx`: added `<a href="/developers">` fixed top-left "Developers" link (`z-50 top-3 left-4`), mirroring the top-right UserBadge.

### Potential concerns to address:
- No DELETE/revoke key endpoint yet — users who hit the 5-key limit see an error message but have no way to remove old keys from the UI. Needs a revoke flow.
- SplashHome `<img>` warnings (lines 26, 35) are pre-existing lint warnings not introduced by this branch; addressed separately if needed.


cost) to score new people on demand. Plus a developer page (docs + dashboard)
and a downloadable Claude Code instructions file.

Full design: `docs/superpowers/specs/2026-05-26-founder-score-api-design.md`.

## Progress Update as of 2026-05-26 05:59 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Phase 2 backend: TDD'd `buildAgentGuide` (2 tests: RED→GREEN) and created the Clerk-auth'd self-serve key route `GET/POST /api/developers/keys`. tsc and eslint both clean.

### Detail of changes made:
- `src/lib/developers/agent-guide.ts`: pure function `buildAgentGuide({ apiKey?, baseUrl })` — generates Markdown for developers to paste into their coding agent. Trims trailing slashes from `baseUrl` so no double-slash URLs appear. Falls back to `YOUR_API_KEY` when no key provided.
- `tests/lib/agent-guide.test.ts`: 2 vitest tests written first (TDD): verifies Bearer token embed, URL normalization (no double slashes), `founder_rows` presence, and placeholder fallback.
- `src/app/api/developers/keys/route.ts`: App Router route with `force-dynamic`. `GET` — returns caller's active (non-revoked) keys (id, prefix, label, createdAt, lastUsedAt). `POST` — mints a new key (max 5 active per user enforced via 409), stores only the hash, returns `raw` once. Both methods 401 when Clerk `userId` is null.

### Potential concerns to address:
- No DELETE/revoke endpoint yet — needed for the frontend to let users remove keys.
- Route has no unit tests (DB/Clerk-touching); tested only via tsc. Integration tests can be added once the frontend is built.

## Progress Update as of 2026-05-26 05:39 AM Pacific

### Summary of changes since last update
Final code review (opus) of Phase 1: "ready to merge", 3 Minor issues only.
Applied the recommended fix — `verifyApiKey`'s `last_used_at` update is now in a
try/catch so a transient write failure can't 500 an otherwise-valid request
(matches its "best-effort" intent). tsc clean. Phase 1 implementation + review done.

## Progress Update as of 2026-05-26 05:34 AM Pacific

### Summary of changes since last update
Task 7 complete: created `src/app/api/v1/score/route.ts` — the `GET /api/v1/score` route handler wiring together `verifyApiKey`, `isValidLinkedinUrl`, `checkAndIncrementRateLimit`, and `fetchScorePayload`. All 5 smoke-test cases returned expected HTTP codes; 200 body contains `scores`, `founder_rows`, `what_you_likely_need`, `cached:true`, and no `usage`/`costUsd`/`publicEmail` fields. `tsc` and `eslint` clean. Phase 1 complete.

### Detail of changes made:
- `src/app/api/v1/score/route.ts`: new App Router route with `export const dynamic = "force-dynamic"`. Auth via `verifyApiKey` (401 on missing/invalid). URL validation via `isValidLinkedinUrl` (400 on bad input). Per-key daily rate limit via `checkAndIncrementRateLimit("apikey:<keyId>", PER_DAY_LIMIT)` (429 on exhaustion). DB lookup via `fetchScorePayload` (404 on miss). `PER_DAY_LIMIT` defaults to 1000, tunable via `API_LOOKUP_PER_DAY_LIMIT` env var.
- Smoke test results: `no-key: 401` ✓ | `200` with `scores`/`founder_rows`/`what_you_likely_need`/`cached:true` ✓ | `unknown: 404` ✓ | `bad-url: 400` ✓ | `bad-key: 401` ✓.
- No forbidden fields (`usage`, `costUsd`, `publicEmail`) in 200 response — confirmed by programmatic check.

### Potential concerns to address:
- Rate-limit counter increments even on cache-miss (404) lookups — intentional to prevent enumeration attacks, but worth documenting for API consumers.
- `PER_DAY_LIMIT` env var not yet documented in `.env.example`; should be added before Phase 2 launch.

## Progress Update as of 2026-05-26 05:30 AM Pacific

### Summary of changes since last update
Task 6 complete: exported `companyNameFromDomain` from `src/lib/leaderboard.ts` (additive only — one `export` keyword added) and appended `fetchScorePayload` with its required imports to `src/lib/api/score-payload.ts`. The fetcher queries evaluations, score_items, recommendation_responses, and users; computes three percentiles in parallel; and delegates to the existing pure `buildScorePayload`. `tsc --noEmit` clean; the 2 pre-existing `eval-pipeline.test.ts` failures are unrelated to this task.

### Detail of changes made:
- `src/lib/leaderboard.ts` line 39: added `export` to `companyNameFromDomain`. No other changes.
- `src/lib/api/score-payload.ts`: prepended 5 import lines at top of file (db, schema tables, drizzle ops, canonicalizeLinkedinUrl, computePercentile + companyNameFromDomain). Appended `RecsBlob` and `ProfileBlob` local types plus `fetchScorePayload` async function.
- `fetchScorePayload(rawUrl, opts?)`: canonicalizes URL → returns null if invalid; queries evaluations by URL; fetches score_items ordered by sortOrder (filters into founderRows/investorRows by rubric); fetches recommendationResponses into a Map; assembles priorities + summary; calls `computePercentile` for all 3 dimensions in parallel; checks users for high/medium confidence claim; extracts companyName from profile blob; delegates to `buildScorePayload`.
- Schema column verification: all columns used (`id`, `linkedinUrl`, `fullName`, `score`, `founderScore`, `investorScore`, `signalQuality`, `profile`, `recommendations`, `summaryStatus`, `summaryConfidence`, `createdAt` on evaluations; `evaluationId`, `rubric`, `reason`, `points`, `confidence`, `status`, `sortOrder` on scoreItems; `evaluationId`, `itemId`, `rating` on recommendationResponses; `id`, `evaluationId`, `matchConfidence` on users) confirmed present in schema.ts.

### Potential concerns to address:
- Two `eval-pipeline.test.ts` failures pre-exist this task: one timeout (network-dependent mock issue), one duplicate-key (stale test fixture URL in dev DB from a prior test run). Not introduced here.
- `users.evaluationId` is nullable in the schema (FK reference, optional). The `eq(users.evaluationId, row.id)` query is safe because Drizzle handles nullable UUID columns.

## Progress Update as of 2026-05-26 05:27 AM Pacific

### Summary of changes since last update
Task 5 complete: created `src/lib/api/score-payload.ts` with pure builder `buildScorePayload` and exported types (`ScoreRow`, `PriorityRow`, `SummaryBlock`, `ScorePayloadInput`). TDD: test written first (confirmed failing), then implementation, all 3 tests now pass. No DB code — YAGNI.

### Detail of changes made:
- `src/lib/api/score-payload.ts`: pure transform function `buildScorePayload(i: ScorePayloadInput)` maps camelCase input to snake_case public API response shape. Splits `fullName` on whitespace (first word → `first_name`, remainder → `last_name`). Derives `cost.basis` as `"cached"` when `chargedCents === 0`, else `"10x_measured"`. No DB imports.
- `tests/lib/score-payload.test.ts`: 3 unit tests covering (1) field mapping + name splitting, (2) null `fullName` handling, (3) cost basis logic.
- All 4 exported types (`ScoreRow`, `PriorityRow`, `SummaryBlock`, `ScorePayloadInput`) named exactly as Task 6 will expect for its `fetchScorePayload` DB fetcher.
- `tsc --noEmit` clean.

### Potential concerns to address:
- `firstName` returns `null` when `fullName` is empty string or null — intentional, callers should handle.
- `lastName` is `null` for single-word names (no space); acceptable for public API but worth documenting.
- No `usage` or `publicEmail` fields in response shape — by design, these must not leak.


cost) to score new people on demand. Plus a developer page (docs + dashboard)
and a downloadable Claude Code instructions file.

Full design: `docs/superpowers/specs/2026-05-26-founder-score-api-design.md`.

## Progress Update as of 2026-05-26 05:25 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 4 complete: created `scripts/create-api-key.ts` seed script and ran it against the dev DB to mint a test API key (`sk_live_ZD-e…`). The row was inserted successfully into `api_keys`.

### Detail of changes made:
- `scripts/create-api-key.ts`: small CLI script that accepts optional `owner` and `label` args (defaults: `"dev-test-user"` / `"dev test key"`), calls `generateApiKey()`, inserts into `api_keys` via drizzle, and prints the raw key once. Follows the same `import "dotenv/config"` + `DOTENV_CONFIG_PATH=.env.local` pattern as other scripts.
- Dev DB seeded: key prefix `sk_live_ZD-e`, owner `dev-test-user`, label `phase1 test`.

### Potential concerns to address:
- Raw key is printed to stdout once; callers must save it immediately — no recovery path exists.
- `scripts/` is excluded from tsconfig; no compile-time type checking on script files.

## Progress Update as of 2026-05-26 05:23 AM Pacific

### Summary of changes since last update
Task 3 complete: appended `verifyApiKey` DB-backed verifier and `VerifiedKey` type to `src/lib/api-keys.ts`; added drizzle-orm imports at top of file; `tsc --noEmit` clean; existing pure functions untouched.

### Detail of changes made:
- `src/lib/api-keys.ts`: added `import { db } from "@/db"`, `import { apiKeys } from "@/db/schema"`, `import { and, eq, isNull, sql } from "drizzle-orm"` at top; appended `VerifiedKey` type and `verifyApiKey(authHeader)` async function that parses bearer token, SHA-256 hashes it, looks up non-revoked row in `api_keys`, updates `last_used_at` on hit, and returns `{ keyId, clerkUserId }` or null.

### Potential concerns to address:
- `last_used_at` update is fire-and-forget (awaited but not critical-path); a failed write there won't surface a 500 — acceptable trade-off for latency.

## Progress Update as of 2026-05-26 05:22 AM Pacific

### Summary of changes since last update
Task 2 complete: pure API-key crypto library (`src/lib/api-keys.ts`) with TDD — wrote failing test first, then implemented three pure functions (`generateApiKey`, `hashApiKey`, `parseBearer`); all 4 tests pass, `tsc --noEmit` clean.

### Detail of changes made:
- `src/lib/api-keys.ts`: three pure functions — `generateApiKey()` returns `{ raw, hash, prefix }` using `randomBytes(24).toString("base64url")` prefixed with `sk_live_`; `hashApiKey(raw)` returns SHA-256 hex digest; `parseBearer(header)` extracts token from `Authorization: Bearer …` case-insensitively, returns null for absent/malformed input.
- `tests/lib/api-keys.test.ts`: 4 vitest tests covering key format/hash/prefix, uniqueness, case-insensitive bearer extraction, and null returns for malformed headers.
- No DB code in this file — `verifyApiKey` is Task 3 (YAGNI).

### Potential concerns to address:
- None for this task; the pure crypto is self-contained and stateless.

## Progress Update as of 2026-05-26 05:19 AM Pacific

### Summary of changes since last update
Task 1 complete: added `api_keys` table to `src/db/schema.ts`, generated migration `0007_curvy_mystique.sql` (CREATE TABLE only, no drops/alters), created `scripts/apply-sql.ts` helper, and applied the migration to the dev DB (verified 0-row SELECT succeeds).

### Detail of changes made:
- `src/db/schema.ts`: appended `apiKeys` table with `id`/`clerkUserId`/`keyHash`/`keyPrefix`/`label`/`lastUsedAt`/`createdAt`/`revokedAt`; unique index on `key_hash`; btree index on `clerk_user_id`.
- `drizzle/0007_curvy_mystique.sql`: generated migration — only `CREATE TABLE "api_keys"` + two index creates.
- `scripts/apply-sql.ts`: general-purpose script that reads a `.sql` file, splits on `"--> statement-breakpoint"`, and executes each statement against `DATABASE_URL` via neon serverless.
- Migration applied to dev DB; `SELECT COUNT(*) FROM api_keys` returns 0 rows with no error.

### Potential concerns to address:
- `scripts/apply-sql.ts` must also be run against the prod DB when this branch merges (or replaced with `drizzle-kit migrate` if that workflow is adopted).
- The `scripts/**/*` glob is excluded from `tsconfig.json`, so script files are not type-checked by `tsc --noEmit`; keep an eye on type errors in scripts when editing them.

## Progress Update as of 2026-05-26 04:45 AM Pacific

### Summary of changes since last update
Wrote the Phase 1 implementation plan and corrected a spec error (combined
percentile already exists; not new work). Decomposed the build into 3 phased
plans; Phase 1 (API keys + free read API) is fully spec'd as bite-sized TDD tasks.

### Detail of changes made:
- `docs/superpowers/plans/2026-05-26-founder-score-api-phase1-keys-and-read.md`:
  7 tasks — api_keys table + migration; pure key crypto; DB verifier; seed
  script; pure payload builder; DB fetcher (score_items/recs/percentiles/claim);
  `GET /api/v1/score` (auth + per-key rate limit + cached lookup).
- Spec corrected: `computePercentile(score, "combined")` already exists/used.

### Potential concerns to address:
- Phase 2 (credits/Stripe/paid POST) and Phase 3 (dashboard + Claude Code file)
  still need their own plans.
- Migration must be applied manually to dev (Phase 1) and later prod DBs.

## Progress Update as of 2026-05-26 04:30 AM Pacific

### Summary of changes since last update
Brainstormed and wrote the design spec (no implementation code yet). All major
decisions resolved with the operator.

### Detail of changes made:
- Wrote `docs/superpowers/specs/2026-05-26-founder-score-api-design.md`.
- Key decisions: API does both free cached lookups + paid score-on-miss;
  pricing = 10× `getEstimateCents()` (measured rolling cost); prepaid credits
  via Stripe Checkout (packs $25/$50/$100/$500/$1,000); roll-your-own hashed API
  keys in Neon; developers auth via existing Clerk; response excludes the raw
  `profile` blob (leaks our cost/margin + PII) but includes the full curated
  field set sourced from `score_items`/`recommendations`/percentile helpers.

### Potential concerns to address:
- Privacy/legal review needed before public launch (LinkedIn-derived data on
  real people sold via API).
- Combined-score percentile mode must be added to `computePercentile()`.
- Free endpoint needs per-key rate limits or the scored DB can be scraped free.

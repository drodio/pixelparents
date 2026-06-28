# Branch: `founder-score-api-billing` — Phase 2: prepaid credits + Stripe

Phase 2 of the public Founder Score API: developers buy prepaid credits (Stripe
Checkout) and spend them to score *new* people via `POST /api/v1/score` at 10×
our measured cost. Reserve-then-refund debit, idempotent top-up webhook.

## Progress Update as of 2026-05-26 04:04 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Raised `/api/v1/resolve` rate limits. Decision (operator): keep resolve **free**
(no per-query charge) — it's a frictionless funnel into paid scoring and costs us
only ~0.7¢/query (measured live). Per-token cap raised 200 → **10,000/day**;
global circuit-breaker raised 1500 → **50,000/day** as a catastrophic-Sybil
ceiling that sits above any single token (so a legit 10k/day user is never
throttled). Both env-tunable. Briefly explored charging $0.05/resolve, then
reverted — the bounded cost didn't justify the funnel friction.

### Detail of changes made:
- `src/app/api/v1/resolve/route.ts`: `PER_DAY_LIMIT` default 10000 (per key/token,
  env `API_RESOLVE_PER_DAY_LIMIT`); `GLOBAL_PER_DAY` default 50000 (env
  `RESOLVE_GLOBAL_PER_DAY`). Worst-case Exa spend: ~$70/day per token, ~$350/day
  global ceiling at ~0.7¢/query.
- Measured resolve cost: 1 Exa search, 0 content fetches, **$0.007/query**
  (vs ~7¢ for a full score → 1/10th). Cached GET /score lookups ≈ $0 (DB read).
- No charging code added; agent guide still documents resolve as free.

### Potential concerns to address:
- A per-token cap can't bound total spend alone (unlimited Clerk accounts →
  unlimited keys); the 50k global breaker is the real ceiling. If legit traffic
  ever approaches 50k/day resolves, raise it via env, don't remove it.

## Progress Update as of 2026-05-26 03:22 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
/developers page now shows the **average profile scoring cost** below "Our API
returns:" — a centered section (`getEstimateCents("sonnet")` × 10 markup, same
number we charge) + "Existing profiles can be queried for free." Page made async
+ force-dynamic. Renders "$0.70" currently.

### Note on C1 (operator pushback — correct):
The paid scoring path already charges via reserve-BEFORE-score, so a fresh $0
account gets 402, not a free scan — making unlimited accounts does NOT yield free
scorings. The C1 global cap is defense-in-depth (burst/quota safety), not a
free-hole fix. The only real free-scoring edge is if the price ever computes to
$0 (rolling cost-median = 0 → reserve($0) succeeds) — the I2 fix (clean/floor the
estimate so price can't be $0) is the genuine protection there. The actual
Sybil/no-pay surface is the FREE endpoints (/resolve, cached /score) — covered by
the /resolve global breaker + per-key limits.

## Progress Update as of 2026-05-26 03:12 PM Pacific

### Summary of changes since last update
Dedicated API hardening pass (opus audit) — fixed the two CRITICALs + UI asks:
- **C1 (critical):** paid `POST /api/v1/score` was the only spend endpoint with NO
  global circuit-breaker → unbounded fresh scorings via Sybil keys/accounts. Added
  `withinGlobalDailyLimit("api-score", API_SCORE_GLOBAL_PER_DAY=1000)` on the paid
  branch only (before reserve/score; cache hits stay free/uncapped).
- **C2 (critical):** webhook granted `metadata.credits_cents` without checking
  amount paid. Now grants `min(amount_total, metadata)` and requires
  `payment_status === "paid"` → "money in = credits granted" invariant. Verified:
  claim 100000 / pay 2500 → grants 2500; unpaid → grants 0.
- **Activity UI:** scored profile is now a clickable link (`/profile?e=<id>`),
  date→date+time (`toLocaleString`), paginated 10/page (Prev/Next), and the
  credits balance is shown in green.
tsc + eslint clean; 6 unit tests pass; C2 verified live; /developers 200.

### Deferred audit items (operator's call):
- **I2** reconcile charged price to actual eval cost / floor at flat fallback so
  the median estimate can't be gamed down. (needs a pricing decision)
- **I1** webhook gates on payment_status (DONE as part of C2).
- **I4** refundCredits symmetry; **M2** cap resolve name/company length; **M3**
  rate_limit.count → bigint. (all low/negligible)
- **What's solid (don't touch):** atomic reserve-before-score, no signup grant,
  webhook idempotency + signature, IDOR protections, hash-only keys.

## Progress Update as of 2026-05-26 03:02 PM Pacific

### Summary of changes since last update
Two requested API features:
- **`GET /api/v1/resolve?name=&company=`** — Bearer-gated (401 without a key, like
  all /api/v1/*), free + per-key rate-limited, reuses `findLinkedinHandles`. Returns
  ranked `{ candidates: [{ url, name, headline }] }` so agents resolve a name→URL via
  OUR search instead of a separate web search, then score. Smoke-tested: 401 no-key,
  400 no-name, 200 returns the right Jordan Lee (a grocery-delivery company) on top.
- **Recent Activity now shows scorings + cost + who.** `/api/developers/credits`
  leftJoins evaluations on the debit's evaluation_id; the console humanizes the
  reason (Top-up/Score/Refund) and appends the scored person's name/handle.
- Agent guide documents `/api/v1/resolve` + a resolve→score example.
tsc + eslint clean; guide test passes.

## Progress Update as of 2026-05-26 02:50 PM Pacific

### Summary of changes since last update
Security/UX fix per operator: the agent-guide markdown must NEVER contain a real
API key (it's rendered + copyable). Removed the `apiKey` param from
`buildAgentGuide` entirely so a key can't be embedded; the Bearer example always
shows the placeholder `[USER WILL PROVIDE API KEY IN sk_festival_live_*** format]`
for signed-in and signed-out users alike. Console no longer passes `rawKey` to it.
Updated the guide test to assert no real key ever appears. tsc + eslint clean, tests pass.

## Progress Update as of 2026-05-26 02:46 PM Pacific

### Summary of changes since last update
More /developers tweaks (batched into the open PR #70):
- **Agent guide updated to match the live paid capability** (`buildAgentGuide`):
  documents `POST /api/v1/score` with `mode:"score_if_needed"` (scores a
  not-yet-scored person + deducts credits, 10× cost, 402 when underfunded),
  `GET /api/v1/credits`, and the top instructions block now mentions on-demand
  paid scoring. Dropped the stale "coming soon" note.
- **Page intro** restructured: bold "Build our founder & investor scoring rubric
  into your own application." / "Existing profiles are free to look up. Pay to
  score new ones." / bold "Our API returns:".
- **Signed-in account UX**: shows "✓ Signed in as <email>" + a "Manage account"
  button that opens Clerk's `openUserProfile()` modal (so devs can add a phone, etc.).

## Progress Update as of 2026-05-26 02:38 PM Pacific

### Summary of changes since last update
Post-ship /developers copy + UI tweaks (operator feedback):
- Credits explainer rewritten: bold "Using our API to get scores and information
  on existing profiles is 100% free." + "Buy credits to score new profiles. Those
  profiles will also be added to the Leaderboard and made available to all API users."
- Secret-key reveal box now has a dismiss (×) button to close it after copying.
- Credit balance moved onto the "Credits" header row, right-justified (removed the
  standalone "Balance:" line).
All in `DeveloperConsole.tsx`. tsc + eslint clean. (Live billing wiring from the
morning is fully in prod: STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET + registered
live webhook + credit tables; verified prod webhook returns 400 not 500.)

## Progress Update as of 2026-05-26 10:13 AM Pacific

### Summary of changes since last update
Merged the latest `origin/main` (8 commits) for the prod ship. Only conflict was
the drizzle migration collision again: main added `0009_flowery_sumo`; we had
`0009_jittery_logan` + `0010_dapper_mandroid`. Resolved by taking main's journal,
deleting our two orphaned migrations, and regenerating ALL our billing schema as
a single clean migration `0010_tough_puff_adder` (CREATE credit_balances +
credit_ledger WITH the clerk_user_id index AND the UNIQUE payment_intent index —
additive, no drops). schema.ts auto-merged (credit tables + unique index intact).
tsc clean, schema in sync, billing tests pass.

### Potential concerns to address:
- **Prod migration is now a single file:** apply `0010_tough_puff_adder.sql` to
  prod DB (creates both credit tables + indexes). (Dev already has the tables.)
- Prod paid path still needs live Stripe keys + prod webhook registration.

## Progress Update as of 2026-05-26 10:01 AM Pacific

### Summary of changes since last update
All 9 build tasks done + final opus review (ready-to-merge w/ one gate). Applied
the fixes:
- **#1 (gate) — race-safe top-up idempotency.** Made `credit_ledger.stripe_payment_intent_id`
  UNIQUE (migration `0010`; Postgres NULLs are distinct so score_debit/refund NULL
  rows coexist) and reordered `topUpCredits` so the LEDGER insert is the gate
  (`onConflictDoNothing`) — only the winner increments the balance. Concurrent
  webhook delivery can no longer double-grant. Re-verified: grant once, retry +0,
  exactly 1 ledger row per payment_intent.
- **#2 (minor)** — documented the rare same-URL concurrent-cache-hit overcharge in
  the paid path (accepted for v1).
- **Live verification done (controller):** signed webhook → credit grant +
  idempotency + bad-sig 400; reserve/refund/link + insufficient-funds guard.

### Potential concerns to address:
- Must `git merge origin/main` before PR (main advanced during the build).
- Prod release: apply migrations `0009`+`0010` to prod DB; set live Stripe keys +
  register prod webhook endpoint.

## Progress Update as of 2026-05-26 09:47 AM Pacific

### Summary of changes since last update
Task 9 (final) complete: added Clerk-authed `GET /api/developers/credits` balance route and Credits section to DeveloperConsole UI. Developers can see their balance, buy packs via Stripe Checkout, and see a 10-item ledger. TSC + ESLint clean; smoke tests pass (401 unauth, 200 /developers, Credits section client-rendered post-hydration).

### Detail of changes made:
- `src/app/api/developers/credits/route.ts`: New route — Clerk-authed GET; returns `{balance_cents, ledger[]}` (last 10 rows). Returns 401 unauthenticated.
- `src/components/developers/DeveloperConsole.tsx`: Added `CREDIT_PACKS` import, `LedgerRow` type, `balanceCents`/`ledger`/`buying`/`topupSuccess` state, credits useEffect (gated on `isLoaded && isSignedIn`, detects `?topup=success`, fetches `/api/developers/credits`), `buy()` function (POSTs to `/api/developers/checkout`, redirects via `window.location.assign()` on success), and Credits `<section>` between Step 2 (keys) and Markdown guide sections. Balance shows "—" when signed out or null. Pack buttons disabled when signed out or during buy. Compact ledger list with signed dollar delta + date. Uses `react-hooks/set-state-in-effect` disable comment for the synchronous `setTopupSuccess` call in the effect body (matches existing pattern for `setKeysLoading`).

### Potential concerns to address:
- `?topup=success` detection is a URL hint only; the webhook may not have fired yet, so balance may not reflect the new credits immediately — acceptable UX for now.
- `window.location.assign()` used instead of `href =` assignment to satisfy the `react-hooks/immutability` ESLint rule.

## Progress Update as of 2026-05-26 09:43 AM Pacific

### Summary of changes since last update
Task 8 complete: added paid `POST /api/v1/score` handler and new `GET /api/v1/credits` route. Cache hits return free (no charge); cache misses with `mode=score_if_needed` reserve credits at 10× measured cost, run `runEval`, link the debit to the eval, and refund on failure. Zero-balance returns 402. TSC + ESLint clean; all 5 smoke cases verified.

### Detail of changes made:
- `src/app/api/v1/score/route.ts`: Added 4 new imports (`getEstimateCents`, `applyMarkup`, `reserveCredits`/`refundCredits`/`linkDebitEvaluation`/`getBalanceCents`, `runEval`) and `POST` handler after existing `GET`. POST: validates key → JSON body → linkedin_url → rate-limit → free cache hit → 404 if no mode → paid path (reserve → runEval → linkDebit → fetchScorePayload) with refund on throw. Uses `result.evaluationId` (confirmed field name in `EvalResult` type and `rowToResult`).
- `src/app/api/v1/credits/route.ts`: New file — `GET` handler returns `{ balance_cents }` for the authenticated API key owner.
- `scripts/seed-balance.ts`: Helper script for smoke-testing (sets `creditBalances` row for a given clerkUserId).

### Potential concerns to address:
- `scripts/seed-balance.ts` is dev-only; not needed in prod but harmless to leave.
- The paid-success debit path (runEval actually scores) is not tested here (would trigger real Exa/Claude calls); tested separately by controller end-to-end.

## Progress Update as of 2026-05-26 09:38 AM Pacific

### Summary of changes since last update
Task 7 complete: created `src/app/api/stripe/webhook/route.ts` — verifies Stripe signature via `constructEventAsync`, grants credits idempotently via `topUpCredits` on `checkout.session.completed`. TSC + ESLint clean; smoke curl returns 500 (STRIPE_WEBHOOK_SECRET not in running server env).

### Detail of changes made:
- `src/app/api/stripe/webhook/route.ts`: `POST` handler with `export const dynamic = "force-dynamic"`. Guards: returns 500 if `STRIPE_WEBHOOK_SECRET` not set, 400 if `stripe-signature` header missing. Reads raw body via `req.text()` (required for signature verification). Calls `getStripe().webhooks.constructEventAsync(raw, sig, secret)` — async variant correct for Next.js route handlers. On `checkout.session.completed`, extracts `clerkUserId` + `credits_cents` from session metadata (falls back to `amount_total`), resolves `payment_intent` id whether string or object, then calls `topUpCredits(clerkUserId, credits, pi)` — idempotent on payment intent id.
- `constructEventAsync` confirmed present in stripe v22.1.1 types (`node_modules/stripe/cjs/Webhooks.d.ts`) — no fallback needed.

### Potential concerns to address:
- `STRIPE_WEBHOOK_SECRET` must be set in Vercel env before live webhook delivery works; smoke curl confirms 500 without it (correct behavior).
- Full end-to-end test (stripe CLI `stripe listen`) deferred to controller verification.

## Progress Update as of 2026-05-26 09:35 AM Pacific

### Summary of changes since last update
Task 6 complete: created `src/app/api/developers/checkout/route.ts` — Clerk-authed POST that validates a packId, creates a Stripe Checkout session with dynamic price_data (no pre-created Stripe products), and returns the session URL. TSC + ESLint clean; unauthenticated curl returns 401.

### Detail of changes made:
- `src/app/api/developers/checkout/route.ts`: `POST` handler that calls `auth()`, validates `body.packId` via `packById()`, builds a one-time Stripe Checkout session (`mode: "payment"`) with `price_data`/`product_data` inline (no pre-created products required), attaches `clerkUserId`/`packId`/`credits_cents` to both `session.metadata` and `payment_intent_data.metadata` (webhook will read from `payment_intent.metadata`), and returns `{ url: session.url }`.
- Stripe v22 types confirmed: `price_data.product_data.name` is `string` (required), `currency`, `unit_amount` are correct field names — no type adjustments needed.

### Potential concerns to address:
- `session.url` can be `null` if Stripe returns an incomplete session object — currently returned as-is; callers should check for null before redirecting.

## Progress Update as of 2026-05-26 09:32 AM Pacific

### Summary of changes since last update
Task 5 complete: created `src/lib/stripe.ts` — lazy Stripe singleton that throws only on use without a key, not on module import. TSC clean; `config` param is optional in stripe v22 so no `apiVersion` required.

### Detail of changes made:
- `src/lib/stripe.ts`: module-level `cached` var + `getStripe()` export; reads `STRIPE_SECRET_KEY` from env at call time; throws `Error("STRIPE_SECRET_KEY is not set")` if missing; returns the cached `Stripe` instance on subsequent calls.
- Confirmed stripe v22.1.1 constructor signature: `(key: string, config?: Record<string, unknown>)` — `config` is optional, so `new Stripe(key)` compiles with no `apiVersion`.

### Potential concerns to address:
- None for this task. `getStripe()` is ready for use by the checkout route (Task 6) and webhook handler (Task 7).

Plan: `docs/superpowers/plans/2026-05-26-founder-score-api-phase2-billing.md`
Spec: `docs/superpowers/specs/2026-05-26-founder-score-api-design.md`

## Progress Update as of 2026-05-26 09:31 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 4 complete: created `src/lib/credits.ts` with all 5 exports — `getBalanceCents`, `reserveCredits`, `linkDebitEvaluation`, `refundCredits`, `topUpCredits`. Implemented exactly per spec; TSC clean.

### Detail of changes made:
- `src/lib/credits.ts`: 5 exported async functions operating on `creditBalances` + `creditLedger` schema tables.
- `getBalanceCents`: single SELECT returning balance or 0 if no row.
- `reserveCredits`: atomic conditional UPDATE (WHERE balance >= cents) — oversell-proof; returns `{ ledgerId, balanceAfter }` or `null` when underfunded; inserts ledger row with `score_debit` reason.
- `linkDebitEvaluation`: UPDATE ledger row to set evaluationId (audit linkage after eval created).
- `refundCredits`: increments balance and inserts a `refund` ledger row; handles missing balance row gracefully (balanceAfter defaults to cents).
- `topUpCredits`: idempotent on `stripePaymentIntentId` — early-returns if ledger row already exists; upserts `creditBalances` then inserts `topup` ledger row.
- No `db.transaction()` usage (Neon HTTP driver has no interactive transactions).

### Potential concerns to address:
- `refundCredits` does not guard against refunding a user whose balance row doesn't exist (UPDATE returns nothing, balanceAfter defaults to `cents`). Edge case only — reserve always creates the balance row first.

## Progress Update as of 2026-05-26 09:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Task 3 complete: created `src/lib/credit-pricing.ts` (pure 10× markup helper, no imports) and `tests/lib/credit-pricing.test.ts` (2 tests, strict TDD — test written first, observed failing, then passing). TSC clean.

### Detail of changes made:
- `src/lib/credit-pricing.ts`: exports `SCORE_MARKUP = 10` and `applyMarkup(measuredCents)` which returns `Math.max(0, Math.round(measuredCents * SCORE_MARKUP))`.
- `tests/lib/credit-pricing.test.ts`: 2 vitest tests — verifies 10× multiplication with rounding and that negative inputs return 0.

### Potential concerns to address:
- No concerns for this task; pure function with no side effects or imports.

## Progress Update as of 2026-05-26 09:28 AM Pacific

### Summary of changes since last update
Task 2 complete: created `src/lib/credit-packs.ts` (pure data + lookup, no DB or imports) and `tests/lib/credit-packs.test.ts` (2 tests, TDD — test written first, observed failing, then passing). TSC clean.

### Detail of changes made:
- `src/lib/credit-packs.ts`: exports `CreditPack` type, `CREDIT_PACKS` array (5 packs: $25/$50/$100/$500/$1,000 in cents), and `packById` lookup function.
- `tests/lib/credit-packs.test.ts`: 2 vitest tests verifying the 5 packs have correct cents values and `packById` returns the right pack or `undefined`.

### Potential concerns to address:
- No concerns for this task; pure data with no side effects.

## Progress Update as of 2026-05-26 09:26 AM Pacific

### Summary of changes since last update
Task 1 complete: appended `creditBalances` and `creditLedger` tables to
`src/db/schema.ts`, generated migration `drizzle/0009_jittery_logan.sql`
(creates only those two tables — no drops/alters), applied it to the dev DB
(verified 0-row counts), and installed `stripe@^22.1.1`.

### Detail of changes made:
- `src/db/schema.ts`: added `creditBalances` (PK = `clerk_user_id`, balance in cents, updatedAt) and `creditLedger` (append-only audit log with delta, reason, optional evaluationId + stripePaymentIntentId, balanceAfterCents; two indexes on clerkUserId and stripePaymentIntentId).
- `drizzle/0009_jittery_logan.sql`: migration file with only the two new `CREATE TABLE` statements + two `CREATE INDEX` statements.
- `drizzle/meta/`: snapshot updated by drizzle-kit.
- `package.json` / `pnpm-lock.yaml`: added `stripe ^22.1.1`.

### Potential concerns to address:
- **Stripe prerequisites (operator):** STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
  must be provisioned for live testing of checkout/webhook (tasks 5–7). Tasks
  1–4, 8, 9 are testable with a seeded balance (no Stripe).
- **Prod release:** apply the credit-tables migration to prod DB before merge;
  set live Stripe keys + register the prod webhook endpoint.
- Neon HTTP driver has no interactive transactions — reserve relies on a single
  atomic conditional UPDATE (oversell-proof); ledger inserts are best-effort.

## Progress Update as of 2026-05-26 09:20 AM Pacific

### Summary of changes since last update
Branched off updated main (Phase 1 is live in prod). Wrote the Phase 2 plan: 9
bite-sized tasks — credit tables + stripe dep; credit packs (pure); 10× markup
(pure); credits lib (balance/reserve/refund/topup); Stripe client; checkout
route; idempotent webhook; paid POST /api/v1/score + GET /api/v1/credits;
dashboard buy-credits.

### Potential concerns to address:
- **Stripe prerequisites (operator):** STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET
  must be provisioned for live testing of checkout/webhook (tasks 5–7). Tasks
  1–4, 8, 9 are testable with a seeded balance (no Stripe).
- **Prod release:** apply the credit-tables migration to prod DB before merge;
  set live Stripe keys + register the prod webhook endpoint.
- Neon HTTP driver has no interactive transactions — reserve relies on a single
  atomic conditional UPDATE (oversell-proof); ledger inserts are best-effort.

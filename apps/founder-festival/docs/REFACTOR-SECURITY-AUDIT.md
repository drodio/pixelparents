# Founder Festival — Refactor & Security Audit

*Lead architect's consolidated report, synthesized from 10 parallel deep-dive reviews with adversarial verification on all security findings.*

---

## Executive Summary

**Overall health: B+ / strong for two weeks of shipping.** This is a disciplined codebase, not a typical move-fast pile of debt. The fundamentals that are hardest to retrofit are already right: TypeScript strict mode with effectively zero escape hatches (0 `ts-ignore`, 3 `as any`), every raw-SQL site parameterized, a verified-correct credit core (race-proof `reserveCredits`, idempotent `topUpCredits`), atomic `FOR UPDATE SKIP LOCKED` job claiming, and a consistent in-route authorization model. The team understands the Next 16 server/client boundary and keeps the docs in-repo. You have built something you can grow on.

**The 5 things that matter most:**

1. **One real account-takeover path (CONFIRMED, high).** LinkedIn "claim" grants full profile ownership on an attacker-controllable, public, non-unique *display name* alone — unlocking score griefing (real Exa+Claude spend), private-recommendation exposure, and profile mutation on any leaderboard subject. This is the single most urgent fix. `src/lib/identity-match.ts:97-101`.
2. **The event-apply endpoint is an open email relay + row-flood (CONFIRMED, high).** Unauthenticated, unthrottled, trusts a client-supplied recipient email, and IDs are harvestable from the public leaderboard. Founder-Festival-branded mail to attacker-chosen addresses + storage DoS. `src/app/api/events/[slug]/apply/route.ts:21`.
3. **Two money-leak paths in billing (CONFIRMED, high).** Stripe refunds/chargebacks keep their credits (no inverse webhook handler), and overlapping cron ticks can double-refund a job's credit hold. Both mint value the user never paid for.
4. **The data pipeline — your #1 concern — is functionally solid but structurally capped.** Enrichers are hard-coded into a 16-entry `Promise.allSettled` array with no registry, almost no per-source timeouts (the slowest of ~16 APIs gates every eval), and throughput is a fixed 5-items/minute sequential loop. 10x/100x is an architecture change, not a config bump.
5. **No CI, no error/loading boundaries, no external-call timeouts, two divergent lockfiles.** Operational gaps that will bite as the team and traffic grow.

**Verdict: a well-built v0 with a small number of sharp, exploitable edges — fix the four CONFIRMED high-severity issues this week, then invest in the pipeline registry/queue refactor to unlock scale.**

A note on verification: every security finding above was adversarially re-traced. The four marked CONFIRMED/high held up fully. The remaining security findings (the unverified ones) are lower-severity defense-in-depth items — real, but not emergencies. None were refuted outright, but several (GitHub-username verification, webhook clerkUserId trust, OG-page public exposure) are *conditional* on config you control and should be treated as hardening, not incidents.

---

## Top Priorities (ranked)

### P0 — fix this week

**P0-1 · LinkedIn name-match account takeover** — *Security, effort M*
**What:** `matchConfidence()` Tier B grants `'high'` ownership when `linkedinNameMatch(claimName, profile.fullName)` succeeds — and that only needs a surname match + one shared given-name token, against the user-editable Clerk `firstName`/`lastName`. `isEvalOwner` treats `high` as full ownership.
**Why it matters for growth:** Every leaderboard profile is a takeover target; a single griefer can re-roll scores (your money), expose private recommendations, and mutate profiles. This is reputational poison the moment the leaderboard gets attention.
**Fix:** Demote name-only to `medium` at most, and require `high` (drop `medium`) in `isEvalOwner`. Gate Tier B behind a verified second signal (verified email-domain match or admin review). Name alone must never reach `high`.

**P0-2 · Unauthenticated event-apply relay + flood** — *Security, effort M*
**What:** `POST /api/events/[slug]/apply` has no `auth()`, no rate limit, no circuit-breaker, and stores a truthiness-only-validated body `email` that downstream auto-approval mails via Resend.
**Why it matters:** Sender-reputation damage (you become a phishing relay) and unbounded `event_applicants` rows. Evaluation IDs are directly harvestable from `/api/leaderboard/page`.
**Fix:** Add per-IP + global rate limiting (mirror `/api/eval`), validate email format/length, and never send to a raw body email — derive from the claimed eval or require `isEvalOwner` for self-application.

**P0-3 · Stripe refunds/chargebacks keep their credits** — *Security/billing, effort M*
**What:** The webhook only handles `checkout.session.completed`; `charge.refunded` / `charge.dispute.created` fall through to `{received:true}`. No inverse debit path exists.
**Why it matters:** Direct, repeatable revenue leak via refund abuse — the classic prepaid-balance carding vector.
**Fix:** Handle `charge.refunded` + `charge.dispute.created`: reverse the ledger row idempotently on a `${pi}:refund` key. Decide policy for already-spent balances (allow negative or flag). At minimum, alert an operator.

**P0-4 · Bulk-job credit-hold double-refund under overlapping ticks** — *Correctness/billing, effort S*
**What:** The job-completion block reads status → refunds → zeroes the hold as three separate statements; the status flip to `completed` is unconditional. The file itself notes ticks overlap (~200s run, 60s fire). Two ticks can both refund the same hold.
**Why it matters:** Mints credits under enforcement; low-frequency but real money, and an easy regression to reintroduce.
**Fix:** Make the completion transition the idempotency gate — `UPDATE ... SET status='completed', credit_hold_cents=0 ... WHERE id=$1 AND status<>'completed' RETURNING ...` and only refund when the UPDATE returns a row.

### P1 — next sprint

**P1-1 · Pipeline: enricher registry + interface** — *Refactor, effort M.* Replace the hard-coded `Promise.allSettled` array with an `Enricher[]` registry (uniform `run(ctx)` signature, per-source `timeoutMs`/`enabled`). Unblocks the #1 product goal. `src/lib/enrichers/index.ts:44-61`.

**P1-2 · Pipeline: per-enricher timeouts + research-phase budget** — *Reliability, effort M.* Only `neo.ts` has an AbortController. One hung SEC EDGAR/GitHub socket stalls an eval to the 300s ceiling. Wrap every fetch in `withTimeout` (4–5s) and return whatever resolved by deadline.

**P1-3 · Missing leaderboard indexes** — *Scalability, effort S.* No index on `score`/`founder_score`/`investor_score` (the hot ORDER BY) or `find_email_queued_at`. Every leaderboard page = full table scan + sort. Add partial composite btree indexes matching the `(col DESC, id DESC)` keyset. `src/db/schema.ts:148-164`.

**P1-4 · find-email cron strands paid-for lookups** — *Reliability, effort M.* The post-charge DB writes sit outside the try/catch; one failure rejects the whole `runPool` and abandons up to 49 already-claimed (queued_at-nulled) rows. Wrap per-row body in try/catch, refund + re-queue on failure.

**P1-5 · No CI pipeline** — *Reliability, effort S.* Strict tsconfig and clean code are protected only by developer discipline. Add a GitHub Action running `lint` + `tsc --noEmit` + `test` as a required check.

**P1-6 · No error.tsx / loading.tsx + /profile renders a DB write** — *Reliability/correctness, effort M.* The most-shared page mutates during GET render (`score_items` backfill at `profile/page.tsx:178`) and has no error boundary. Move the backfill to scoring time; add boundaries.

### P2 — soon, scheduled

- **God-file decomposition** (`eval-pipeline.ts` 1089 LOC, `scoring.ts` 1060 LOC) — *Refactor, effort L.*
- **Throughput: concurrent batch + queue model** — *Scalability, effort L.*
- **/profile sequential await waterfall** (~13 serial Neon round-trips) — *Scalability, effort M.*
- **Two divergent lockfiles** (npm + pnpm) — *Reliability, effort S.*
- **rate_limit table grows unbounded** — *Scalability, effort S.*
- **Observability:** only 6 of 55 routes report errors; scoring-tick per-item catch is invisible to PostHog — *Maintainability, effort M.*

---

## Security (CONFIRMED issues only, by adjusted severity)

All four below were independently re-traced against the real code and confirmed. The exploit paths are real, not theoretical.

### 1. [HIGH] LinkedIn claim grants full ownership on a name match alone
**Files:** `src/lib/identity-match.ts:97-101`, `:147-159`; `src/app/(authed)/claim/callback/route.ts:55-92`, `:120-132`
**Exploit path:**
1. Sign up via LinkedIn OAuth (links a LinkedIn external account → provider becomes `"linkedin"`, independent of the name fields).
2. In Clerk settings, edit `firstName`/`lastName` to a target founder's public leaderboard name (e.g. "John Smith").
3. `GET /claim/callback?e=<victimEvalId>`. Tier A (email) fails; Tier B calls `linkedinNameMatch("John Smith","John Smith")` → surname match + shared "john" → `{kind:"match"}`.
4. Callback upserts the `users` row with `matchConfidence:"high"`, `evaluationId=victimEvalId` (conflict target `clerkUserId`, so one attacker account re-points at any eval).
5. `isEvalOwner` (`authz.ts:21-24`, returns true for `high|medium`) now unlocks `/api/rescore` (real Exa+Claude spend, overwrites the victim score), `/api/recommendations` + `/visibility`, `/api/score-items`, `/api/badges`, and `/api/account/*`.

Mitigations considered and found insufficient: `auto-claim.ts` is conservative but does **not** gate the vulnerable `/claim/callback` path; rate-limiting on rescore caps volume but not the takeover; the code itself documents `firstName` as user-controlled (`welcome-emails.ts:35`).
**Remediation:** Name-only → `medium` max; require `high` (drop `medium`) in `isEvalOwner`; gate Tier B behind a verified email-domain match or admin review. `high` must be unreachable by name alone.

### 2. [HIGH] Unauthenticated event-apply: open email relay + row-flood DoS
**Files:** `src/app/api/events/[slug]/apply/route.ts:21`, `:83`, `:90`; `src/lib/events.ts:93-100`
**Exploit path:**
1. `GET /api/leaderboard/page` → harvest a real `evaluationId` (`LeaderboardRow.id === evaluations.id`, `leaderboard.ts:222`).
2. For any non-draft/non-closed event with `approvalMode` auto/hybrid: `POST /api/events/<slug>/apply` with `{"evaluationId":"<uuid>","email":"victim@target.com"}`, no auth.
3. Route inserts the applicant and runs `processEventApplicantAutoRule`; on criteria match → `transitionApplicant('approved')` → `sendApprovedEmail({to: attacker-chosen})` via Resend with a fixed FROM.
4. Vary `evaluationId` (distinct `linkedinUrl`) to bypass the only throttle (per-`(eventId,linkedinUrl)` dedupe) and flood `event_applicants`.

Caveat (does not lower severity): default `approvalMode` is `'manual'`, where the inline auto-email is a no-op — but the malicious recipient then lands for a later admin bulk-approve to mail, and any auto/hybrid event is an immediate relay.
**Remediation:** `checkAndIncrementRateLimit('apply:'+ip, N)` + `withinGlobalDailyLimit('apply', M)`; real email-format validation + length bound; never mail a raw body email — require `isEvalOwner` for self-application or send only to emails already verified on the eval.

### 3. [HIGH] Stripe webhook ignores refunds/disputes — charged-back money keeps its credits
**Files:** `src/app/api/stripe/webhook/route.ts:24-45`; `src/lib/credits.ts:64-78`
**Exploit path:** Buy a credit pack → `checkout.session.completed` grants credits → spend or hoard → file a refund/chargeback → Stripe sends `charge.refunded`/`charge.dispute.created` → the webhook signature-verifies it then **ignores** it (no matching branch, returns `{received:true}`) → money returns, balance untouched. Repeatable per pack. The ledger `reason` enum (`schema.ts:824-825`) has no Stripe-reversal concept; `refundCredits`'s only callers are internal scoring-failure reversals.
**Severity note:** High, not critical — credits buy compute (value extraction), not withdrawable cash, and real chargebacks incur Stripe dispute fees + ban risk, bounding repeatability.
**Remediation:** Handle `charge.refunded` + `charge.dispute.created`; reverse the ledger row idempotently on a `${pi}:refund` key; policy-decide already-spent balances; alert operator.

### 4. [HIGH] Bulk-job credit-hold double-refund under overlapping cron ticks
**Files:** `src/app/api/cron/scoring-tick/route.ts:288-334`; `src/lib/credits.ts:64-78`
**Exploit path (no attacker needed — a race):** Item claiming uses `FOR UPDATE SKIP LOCKED`, but the per-`jobId` completion block does not. The re-run guard is `j.status !== "completed"`, yet the status flip is a *separate, unconditional* UPDATE. Two ticks that both drive the last items terminal can both read `status='running'` + non-zero `creditHoldCents` and both call `refundCredits` (an unconditional `balanceCents + cents`, no idempotency key) → two `refund` ledger rows, inflated balance.
**Remediation:** Collapse read + refund-decision + hold-zeroing into one atomic conditional UPDATE with `RETURNING`; refund only when this tick won the transition.

**Down-ranked / hardening (unverified, lower severity — real but not incidents):**
- *Claim callback uses possibly-unverified `emailAddresses[0]`* (`callback:128`) — medium; fix by reusing the verified-email helper.
- *GitHub username trusted without `verification.status==='verified'`* (`auto-claim.ts:32`) — low; verified by construction in normal OAuth, assert it explicitly.
- *Webhook trusts `metadata.clerkUserId`* — low; signature-verified and set from `auth()`, residual risk is dashboard misconfig only.
- *Non-constant-time secret compare; `refresh-mm` CRON_SECRET fallback; preview localhost-Host bypass* — low; harden but not urgent. The preview `find-email-tick` bypass spends real AnyMailFinder money, so tighten that one first.
- *OG/profile pages publicly enumerable for unclaimed subjects* — a **product/privacy decision**, not a bug; PII (phone/email/location) is correctly excluded. Confirm intent; add `noindex` if not.

---

## Data Pipeline (your #1 concern)

### Current state: solid at the edges, capped in the middle

**What's good and should be preserved:** `allSettled`-wrapped enrichers (a thrown enricher can't fail the eval), idempotent insert, the atomic SKIP-LOCKED job claim, schema `.catch()` defaults. The research→score boundary already exists as a type (`ResearchInputs`, `eval-pipeline.ts:499`).

**What caps growth — four structural problems:**

1. **No registry/interface.** 16 enrichers as positional literals with non-uniform signatures (`index.ts:44-61`); the `source` union is hand-maintained. Adding a source = a coordinated edit across ≥3 sites with no compile-time link. No place to attach per-source timeout/cost/confidence config, no per-env enable/disable, no A/B.
2. **No failure isolation against hangs.** `allSettled` survives *rejections* but waits for the *slowest* member. Only `neo.ts` has a timeout. One hung SEC EDGAR/GitHub socket → eval runs to the 300s `maxDuration` kill, billing Exa+Claude with no result.
3. **Fixed, sequential throughput.** `ITEMS_PER_TICK=5`, strictly sequential `for (const c of claimable)` (`scoring-tick:162`), once/minute → ~300 evals/hr ceiling. A 10k-row job ≈ 33h. `runPool` exists but is unused here. No per-source rate budgeting, so you can't safely raise the constant without GitHub/Exa/SEC bans.
4. **God files tangle research + LLM + cost + persistence.** `eval-pipeline.ts` (1089) and `scoring.ts` (1060) mix model IDs/pricing, brace-matching JSON extraction, three live cascade strategies, post-processing, and both INSERT/UPDATE persistence. Cost is hand-summed per cascade branch (easy to under-report). The `rule`-enum `.catch(undefined)` can silently cap a $1.5B founder-valuation row at +200.

### Target architecture

```
                       ┌─────────────────────────────────────────┐
  queue (leased jobs)  │  scoring-tick / worker (runPool, N conc) │
  ───────────────────► │  token-bucket per source (GH/Exa/SEC)    │
                       └───────────────┬─────────────────────────┘
                                       ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  Orchestrator (thin):  research → score → post-process → persist│
   └───────┬───────────────┬──────────────┬───────────────┬────────┘
           ▼               ▼              ▼               ▼
   research-runner    model-client    post-process    persistence
   (ENRICHERS[]       (gateway IDs,   (clamp, MM      (write fields,
    registry, each     pricing,        bonus, verif-   sanitize JSONB,
    run(ctx) behind    scoreWithClaude, weighting)     runEval/reEval)
    withTimeout +      extractJson,
    per-source budget) CostMeter)      ┌─ cascade.ts (ScoringStrategy
                                       │   factory: single | binary | 3-tier)
                                       └─ scoring-prompt.ts + scoring-schema.ts
```

**Key interfaces:**
- `interface Enricher { source: Source; run(ctx: EnrichCtx): Promise<EnrichmentResult>; timeoutMs?: number; enabled?(env): boolean }` and `const ENRICHERS: Enricher[]`. Derive the `source` union via `typeof ENRICHERS[number]['source']`. Precompute `ctx.knownUrls` once so every `run(ctx)` is uniform.
- Per-source result carries **provenance**: `status: 'ok' | 'empty' | 'failed' | 'timeout'` persisted alongside facts — so an eval scored during a GitHub outage is distinguishable from a genuine no-GitHub, and a re-score can selectively re-enrich.
- `CostMeter` accumulates LLM+Exa cost in one place (`meter.add(usage)`), ending per-branch hand-summing.
- `ScoringStrategy` factory keyed off env collapses the three cascades behind one interface so prod and benchmark paths share cost+post-process code.

**Failure isolation:** every enricher fetch runs through one `safeFetch{Text,Json}(url, {timeoutMs, maxBytes})` with `AbortSignal.timeout` + a byte cap (2–5MB; today bodies are read unbounded — a poisoned/large upstream can OOM the function). A research-phase deadline returns whatever resolved; a timeout is treated exactly like the existing `allSettled` drop.

**Cost-control seams:** single pricing module (source of truth, not a drifting inline constant); `CostMeter` per eval; token-bucket per external source so concurrency is bounded by *source budgets*, not a global magic number.

**Queue/worker:** move from the polling constant to a leased-job table (the SKIP-LOCKED claim already makes horizontal workers safe) with multiple concurrent cron lanes, or Vercel Queues/Workflow. Immediate stopgap: `runPool(claimable, N)` inside the existing tick.

### Phased migration

- **Phase 0 (P1, days):** `withTimeout` + `safeFetch` byte cap on every enricher; `runPool` the claimed batch; require `GITHUB_TOKEN` in prod (60→5000 req/hr; today 4 sequential probes exhaust the budget in ~15 evals and silently null). Pure additive reliability + throughput, no architecture change.
- **Phase 1 (P1→P2, ~1 week):** Introduce `Enricher` interface + `ENRICHERS[]` registry; persist per-source provenance. Adding a source becomes one object.
- **Phase 2 (P2, ~1–2 weeks):** Split the god files along the diagram seams; extract `CostMeter` + single pricing module; collapse cascades behind `ScoringStrategy`. Cache `ResearchInputs` on the row so a model-only re-score skips re-research (today every re-score pays full Exa).
- **Phase 3 (when volume demands):** Leased-job queue + token-bucket per source + concurrent lanes. This is the actual 10x/100x unlock.

---

## Refactor (grouped, prioritized)

**God files & coupling** *(L)* — Split `eval-pipeline.ts` → `model-client.ts` / `cascade.ts` / `post-process.ts` / `persistence.ts`; split `scoring.ts` → `scoring-prompt.ts` (rubric + builder + `sanitizeUntrusted`) + `scoring-schema.ts` (Zod). Add a thin **repo layer** of canonical reads — 29 of 55 routes import `db` directly and `from(evaluations)` appears in ~35 files; a forgotten claim/confidence filter is a correctness risk replicated everywhere.

**Identity consolidation** *(M)* — Two divergent `nameTokens`, three `slugify` copies, three identity modules, a dead `namesPlausiblyMatch` export, 51 dup groups in `DEFERRED-DUPLICATES.md`. This fragmentation is the *root cause of the duplicate-profiles bug you already hit* (per memory). One shared `normalize` primitive; consolidate `slugify`; delete dead code.

**DB / indexing** *(S–M)* — (1) Partial composite btree on `(score DESC, id DESC)` + same for founder/investor scores, with the `baseWhere` predicate. (2) Partial index on `find_email_queued_at WHERE NOT NULL`. (3) `pg_trgm` GIN on `full_name` for the leading-`%` search ILIKE. (4) Daily `DELETE FROM rate_limit WHERE day < current_date - 2`. (5) Select only needed JSONB subpaths on the leaderboard hot path instead of the whole `profile` blob. (6) Back ranking/percentile window scans with the new score index, or cache full ranking in `app_stats`. Consider a second neon-serverless (WebSocket) client for the long crons.

**Frontend** *(S–M)* — Add `error.tsx`/`loading.tsx` (none exist anywhere); move the `/profile` render-path DB write out of GET; parallelize the ~13-query serial waterfall after the gating `evaluations` fetch; virtualize or server-paginate the admin table (currently sorts/filters/exports the whole dataset client-side); fetch DeveloperConsole data in the RSC instead of two mount `useEffect`s.

**Reliability/obs** *(S–M)* — Timeouts on *every* external call (enrichers, Exa, AnyMailFinder, Resend, AI Gateway — none today); stale-claim reaper for items stuck in `'scoring'` after a maxDuration kill (today they strand forever and the credit hold never reconciles); wrap `resolveClerk` so a Clerk 429 doesn't abort the whole lifecycle pass; route caught errors to `reportServerError` (6/55 routes today); move the per-instance alert-dedupe Map to a durable table; make `refundCredits` idempotent (asymmetric with idempotent `topUpCredits`); scope the `v1/score` catch to `runEval` only (a post-score throw currently refunds work you actually paid vendors for).

---

## Quick Wins (high-value, S effort)

1. **Index `(score DESC, id DESC)`** + `find_email_queued_at` partial index — kills full scans on the hottest queries.
2. **Add the cron idempotency-gate UPDATE** (P0-4) — one query change closes a money leak.
3. **Rate-limit the event-apply endpoint** — drops the relay/flood blast radius immediately even before the email-derivation refactor.
4. **`isEvalOwner` requires `high` (drop `medium`)** — shrinks the takeover surface in one line while you build the real Tier-B gate.
5. **CI workflow** (`lint` + `tsc --noEmit` + `test` as a required check) — locks in the strict-mode discipline.
6. **Pick one package manager** — add `packageManager` + `engines.node`, delete the npm lockfile, set Vercel install to `--frozen-lockfile`.
7. **Regenerate `.env.example`** from a `process.env` grep (~30 undocumented vars incl. Stripe/AnyMailFinder/Luma) + a boot-time zod env check.
8. **Pin Stripe `apiVersion`** — stops the account-level version from shifting webhook payloads under you.
9. **`daily DELETE FROM rate_limit`** — bounds unbounded table growth.
10. **`GITHUB_TOKEN` required in prod** — fixes silent under-scoring of technical founders.

---

## Suggested sequencing / roadmap

**Week 1 — stop the bleeding (P0s + cheapest wins).**
P0-1 (`isEvalOwner` high-only now, real Tier-B gate behind it) · P0-2 (rate-limit + email derivation) · P0-3 (refund/dispute webhook) · P0-4 (idempotency-gate UPDATE) · Quick Wins 1, 5, 6, 8.

**Week 2 — pipeline reliability + the index/CI foundation.**
Pipeline Phase 0 (timeouts, `safeFetch` byte cap, `runPool`, `GITHUB_TOKEN`) · P1-3 indexes · P1-4 find-email isolation · P1-6 boundaries + move `/profile` write · `.env.example` + env schema.

**Weeks 3–4 — the registry refactor (your #1 goal).**
Pipeline Phase 1 (`Enricher` interface + registry + provenance) · identity consolidation (kills the dup-profile root cause) · repo layer for canonical reads · observability (`reportServerError` everywhere, durable alert dedupe, stale-claim reaper).

**Month 2 — decompose + cache + scale.**
Pipeline Phase 2 (god-file split, `CostMeter`, `ScoringStrategy`, cached `ResearchInputs`) · frontend waterfall + admin-table virtualization · leaderboard caching (`use cache`/`unstable_cache` for the anonymous first page).

**When volume demands it — Phase 3 queue/worker + per-source token buckets.** This is the architectural 10x/100x unlock; the SKIP-LOCKED claim already makes it safe.

The codebase is in genuinely good shape for two weeks of work. The four CONFIRMED highs are sharp but contained, and the pipeline refactor is evolutionary, not a rewrite — the right seams (`ResearchInputs`, SKIP-LOCKED claims, idempotent credit core) already exist to build on.

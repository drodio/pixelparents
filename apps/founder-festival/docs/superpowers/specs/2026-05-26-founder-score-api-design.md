# Founder Score API — Design Spec

- **Date:** 2026-05-26
- **Branch:** `founder-score-api`
- **Status:** Design approved; pending implementation plan.

## Goal

Let outside developers access the Founder Score through a public HTTP API. They
register (via our existing Clerk auth), generate an API key, and either look up
**already-scored** people for free or pay to **score new** people on demand.
Ship a dedicated developer page (docs + dashboard) and a downloadable Markdown
file they can drop into their own Claude Code to drive the API.

## Decisions (resolved during brainstorming)

| Topic | Decision |
|---|---|
| What the API does | **Both**: free cached lookups + paid on-demand scoring on a cache miss |
| Pricing | **10× our measured rolling cost** — reuse `getEstimateCents()` (median of recent real eval costs); auto-updates as the rubric/enrichers evolve. No manual per-rubric-item cost annotations. |
| Billing model | **Prepaid credits** (not per-call charges, not monthly metered) |
| Credit packs | **$25 / $50 / $100 / $500 / $1,000** |
| Key management | **Roll-your-own in Neon** (hashed keys), not Clerk API Keys, not Unkey |
| Developer identity | Developers **sign in with the existing Clerk auth** |
| Response data | Full curated field set (below); **exclude the raw `profile` blob** (it leaks our `usage.costUsd`/margin and contains PII like `publicEmail`) |

## Data model

### New Neon tables

```
api_keys
  id              uuid pk
  clerk_user_id   text not null            -- owner (the developer)
  key_hash        text not null unique     -- SHA-256 of the raw key; raw shown once
  key_prefix      text not null            -- e.g. "sk_live_ab12" for dashboard display
  label           text                     -- user-chosen name
  last_used_at    timestamptz
  created_at      timestamptz default now()
  revoked_at      timestamptz              -- soft revoke

credit_balances                            -- source of truth for the atomic check
  clerk_user_id   text pk
  balance_cents   integer not null default 0
  updated_at      timestamptz default now()

credit_ledger                              -- append-only audit trail
  id                       uuid pk
  clerk_user_id            text not null
  delta_cents              integer not null     -- + topup, - debit, + refund
  reason                   text not null        -- 'topup' | 'score_debit' | 'refund'
  evaluation_id            uuid                 -- set for score_debit / refund
  stripe_payment_intent_id text                 -- set for topup
  balance_after_cents      integer not null
  created_at               timestamptz default now()
```

### Reused as-is (no change)

- `evaluations` (+ the `costLlmCents`/`costExaCents`/`costTotalCents` we already record)
- `score_items` — per-row `reason`, `points`, `confidence` (0–100), `status`
  (`likely`/`pending`/`confirmed`/`rejected`). **Source the API's score rows from here**, not the raw `breakdown` blob.
- `evaluations.recommendations` (`{ summary, items[] }`) + `summaryStatus`/`summaryConfidence` (the "what you likely need" paragraph)
- `recommendation_responses` (owner ratings on priority items)
- `users` (claim state → "claimed?" derive; `firstName`/`lastName` when claimed)
- `getEstimateCents()` (pricing basis), `runEval()` (on-demand scoring),
  `computePercentile()` (founder/investor/**combined** percentiles — all already supported), `rate_limit` (throttling)

## API surface

Versioned under `/api/v1/`. Auth: `Authorization: Bearer sk_live_…`, verified by
SHA-256 hash lookup in `api_keys` (rejected if missing/revoked). Every request
updates `last_used_at`.

### `GET /api/v1/score?linkedin_url=…`
Free cached lookup. `200` with the payload, or `404` if never scored. Rate-limited per key.

### `POST /api/v1/score`
Body: `{ linkedin_url: string, mode?: "cached_only" | "score_if_needed" }`
(default `cached_only`). Optional `Idempotency-Key` header.
- Cache hit → return payload, **free**, `cached: true`.
- Miss + `cached_only` → `404`.
- Miss + `score_if_needed` → price = `10 × getEstimateCents("sonnet")`; **atomically
  reserve** from balance; if underfunded → `402` with `{ balance_cents, price_cents, topup_url }`;
  else run `runEval`, on success write `score_debit` + return (`cached: false`), on
  failure write `refund` (net zero) and return `503`.

### `GET /api/v1/credits`
`{ balance_cents, recent_ledger: [...] }`.

### Error codes
`400` bad input · `401` missing/invalid/revoked key · `402` insufficient credits ·
`404` not scored (cached path) · `429` rate limited · `503` scoring failed (no charge).

## Response payload (the full field set)

```jsonc
{
  "linkedin_url": "...",
  "full_name": "...",          // from evaluations.fullName
  "first_name": "...",          // split from fullName, or claimer's Clerk name if claimed
  "last_name": "...",
  "company_name": "...",        // derived via the leaderboard companyName helper
  "claimed": true,              // derive: users row w/ matchConfidence high|medium
  "signal_quality": "high",
  "scores": {
    "overall":  { "score": 530, "percentile": 78 },   // computePercentile(score, "combined") — already exists
    "founder":  { "score": 410, "percentile": 81 },
    "investor": { "score": 120, "percentile": 60 }
  },
  "founder_rows": [             // from score_items where rubric='founder'
    { "reason": "...", "points": 10, "confidence": 100, "status": "confirmed" }
  ],
  "investor_rows": [ /* score_items where rubric='investor' */ ],
  "what_you_likely_need": {     // recommendations.summary
    "text": "...", "status": "confirmed", "confidence": 90
  },
  "current_priorities": [       // recommendations.items + recommendation_responses
    { "id": "...", "text": "...", "category": "fundraising", "rating": 4 }
  ],
  "scored_at": "2026-05-20T...",
  "cached": true,
  "cost": { "charged_cents": 0, "basis": "cached" }   // or { charged_cents: 280, basis: "10x_measured" }
}
```

**Never** included: `usage` (our cost/tokens/margin), `publicEmail`, raw enrichment payloads.
A later opt-in (`?include=profile`) could expose a *curated* subset (`githubUsername`,
`primaryCompanyDomain`, enrichment `facts`/`citations`) — out of scope for v1.

"Confirmed" semantics: score rows carry the real `status` (so a caller can filter to
human-confirmed signals); priorities carry the owner `rating` (1–4) as the confirm signal
(no separate confirm/reject flag — decided "ok as is").

## Pricing & billing flow

- **Top-up:** dashboard pack → Stripe Checkout. The credit grant happens in the
  `checkout.session.completed` **webhook** (idempotent on the Stripe event id):
  `balance += amount`, append `topup`. One Stripe charge per top-up amortizes the
  ~2.9%+30¢ fee.
- **Debit (reserve → refund-on-failure):** atomic
  `UPDATE credit_balances SET balance_cents = balance_cents - :price
   WHERE clerk_user_id = :id AND balance_cents >= :price RETURNING balance_cents`.
  No row ⇒ `402`. Run eval; success ⇒ `score_debit` ledger row; failure ⇒ `refund`.
  Race-proof (concurrent calls can't both overspend); failures never net a charge.
- **Idempotency:** webhook on Stripe event id; `POST /score` honors an
  `Idempotency-Key` so client retries don't double-score/charge.

## Rate limiting / abuse

Apply per-key daily limits to **both** the free and paid endpoints (reuse the
`rate_limit` table, keyed `apikey:<id>`). The free endpoint especially needs it —
otherwise the whole scored DB could be scraped for free. Exact numbers TBD at
implementation (start conservative, env-tunable).

## Developer page + dashboard

New route (e.g. `/developers`) inside the existing app (reuses Clerk + layout):
- **Public docs** (no login): what it does, free-vs-paid model, pricing, endpoint reference.
- **Authed dashboard:** create/revoke keys (raw key shown once), balance + ledger,
  buy a credit pack (→ Stripe Checkout), download the Claude Code file.

## Claude Code instructions file

A Markdown file the developer downloads **with their key prefilled**, dropped into
their Claude Code project as a context file. Written for an LLM agent to act on:
base URL, `Authorization` header, the `/score` + `/credits` calls, the free/paid
`mode` distinction, the response schema, the `402/404/429` errors, and worked
examples ("score + rank this list of inbound founders", "enrich a CRM row",
"check one handle").

## Cost model (for us)

- **Cached lookups:** a Neon read + Vercel invocation. Effectively free.
- **Paid scorings:** real Exa+Claude cost (~$0.13–0.35) billed at **10×** ⇒ net positive
  (~9× margin). 10× is large headroom vs. per-eval variance.
- **Stripe:** ~2.9%+30¢ **per top-up** (not per scoring) ⇒ ~3% of revenue.
- **Infra:** Neon/Vercel/Clerk already paid; new tables tiny; no new vendor. Marginal ≈ $0.
- Net: structurally profitable; the only leak is free-tier scraping → mitigated by rate limits.

## Risks

1. **Privacy/legal** — selling API access to scores + derived priorities + names of
   real people (LinkedIn-derived) has GDPR/CCPA and LinkedIn-ToS implications. Needs a
   legal review before public launch. (Flagged, not resolved here.)
2. **Free-tier scraping** — mitigated by per-key rate limits on the free endpoint.

## Out of scope (v1)

- Batch scoring endpoint (callers loop sequentially).
- Per-key usage analytics dashboard.
- Metered/monthly billing (prepaid only).
- `?include=profile` curated enrichment subset.
- A `/score/quote` price-preview endpoint (nice-to-have; can add later).

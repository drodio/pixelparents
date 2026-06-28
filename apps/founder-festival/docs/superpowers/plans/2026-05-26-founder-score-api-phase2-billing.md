# Founder Score API — Phase 2: prepaid credits + Stripe + paid scoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a developer buy prepaid credits (Stripe Checkout) and spend them to score *new* people on demand via `POST /api/v1/score` at 10× our measured cost, with a race-proof reserve-then-refund debit and an idempotent top-up webhook.

**Architecture:** Two new Neon tables — `credit_balances` (source-of-truth balance, atomically decremented) and append-only `credit_ledger` (audit). A `credits.ts` lib does balance/debit/refund/top-up. Stripe Checkout (dynamic `price_data`, no pre-created products) funds the balance via a signature-verified `checkout.session.completed` webhook. `POST /api/v1/score` adds a paid path: cache-hit is free; on a miss with `mode:"score_if_needed"` we reserve `10 × getEstimateCents("sonnet")`, run `runEval`, and refund on failure. The dashboard gets a balance display + pack buttons.

**Tech Stack:** Next.js 16 route handlers, Drizzle + Neon, the `stripe` npm SDK, Clerk auth (dashboard routes) + our API-key auth (`/api/v1/*`), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-26-founder-score-api-design.md` (Phase 2 sections).
**Builds on Phase 1 (already on main):** `verifyApiKey` (`@/lib/api-keys`), `fetchScorePayload(rawUrl, opts?)` (`@/lib/api/score-payload`), `GET /api/v1/score`, the `api_keys`/Clerk-auth pattern in `src/app/api/developers/keys/route.ts`.
**Reused:** `getEstimateCents(model): Promise<number>` (`@/lib/admin`, returns cents), `runEval(rawUrl, "url", { model })` (`@/lib/eval-pipeline`, creates+returns the eval; throws on hard failure), `isValidLinkedinUrl` (`@/lib/canonicalize`), `checkAndIncrementRateLimit` (`@/lib/rate-limit`), `auth()` from `@clerk/nextjs/server`.

**⚠️ Stripe prerequisites (operator, before live testing — NOT code):** a Stripe account; `STRIPE_SECRET_KEY` (test key for dev) and `STRIPE_WEBHOOK_SECRET` set in `.env.local` and later in Vercel; a webhook endpoint registered at `/api/stripe/webhook` for the `checkout.session.completed` event (use `stripe listen --forward-to localhost:3000/api/stripe/webhook` in dev). Tasks 1–4, 8, 9 are testable WITHOUT Stripe (seed a balance row directly); tasks 5–7 need the keys for live verification.

**Repo conventions (every commit):** prepend a `## Progress Update as of <date>` entry to `PRD/founder-score-api-billing.md` and stage it (the pre-commit hook fails otherwise; `TZ=America/Los_Angeles date "+%Y-%m-%d %I:%M %p Pacific"`). When `src/db/schema.ts` changes, run `pnpm db:generate` and stage `drizzle/` (drift guard). Never `--no-verify`. Migrations are applied manually to dev now, prod at release.

---

### Task 1: Credit tables + migration; install Stripe

**Files:**
- Modify: `src/db/schema.ts` (append two tables)
- Generated: `drizzle/*.sql` via `pnpm db:generate`
- Modify: `package.json` (add `stripe`)

- [ ] **Step 1: Append the tables** to `src/db/schema.ts` (reuse existing `pgTable`/`text`/`integer`/`uuid`/`timestamp`/`index` imports):

```ts
export const creditBalances = pgTable("credit_balances", {
  // One row per developer (Clerk user id). Source of truth for the atomic check.
  clerkUserId: text("clerk_user_id").primaryKey(),
  balanceCents: integer("balance_cents").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    // + for topup/refund, - for score_debit.
    deltaCents: integer("delta_cents").notNull(),
    // 'topup' | 'score_debit' | 'refund'
    reason: text("reason").notNull(),
    // set on score_debit (linked after the eval is created) / refund.
    evaluationId: uuid("evaluation_id"),
    // set on topup; also the idempotency key for the webhook.
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    balanceAfterCents: integer("balance_after_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index("credit_ledger_clerk_user_id_idx").on(t.clerkUserId),
    piIdx: index("credit_ledger_payment_intent_idx").on(t.stripePaymentIntentId),
  }),
);
```

- [ ] **Step 2: Generate migration** — `pnpm db:generate`. Expected: a new `drizzle/XXXX_*.sql` with `CREATE TABLE "credit_balances"` and `"credit_ledger"` only. If it tries to DROP/ALTER any other table → STOP, report BLOCKED (drift).

- [ ] **Step 3: Apply to dev DB** — `DOTENV_CONFIG_PATH=.env.local pnpm exec tsx scripts/apply-sql.ts drizzle/<generated-file>.sql` (the `apply-sql.ts` helper already exists from Phase 1). Verify: `SELECT count(*) FROM credit_balances` and `... credit_ledger` both return 0 with no error.

- [ ] **Step 4: Install Stripe** — `pnpm add stripe`. Verify it's in `package.json` dependencies.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/ package.json pnpm-lock.yaml PRD/founder-score-api-billing.md
git commit -m "feat(billing): credit_balances + credit_ledger tables; add stripe dep"
```

---

### Task 2: Credit packs (pure)

**Files:**
- Create: `src/lib/credit-packs.ts`
- Test: `tests/lib/credit-packs.test.ts`

- [ ] **Step 1: Failing test** (`tests/lib/credit-packs.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { CREDIT_PACKS, packById } from "@/lib/credit-packs";

describe("credit packs", () => {
  it("offers the five operator-approved packs in cents", () => {
    expect(CREDIT_PACKS.map((p) => p.cents)).toEqual([2500, 5000, 10000, 50000, 100000]);
    expect(CREDIT_PACKS.every((p) => p.id && p.label)).toBe(true);
  });
  it("packById returns the pack or undefined", () => {
    expect(packById("usd_25")?.cents).toBe(2500);
    expect(packById("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm exec vitest run tests/lib/credit-packs.test.ts`).

- [ ] **Step 3: Implement** (`src/lib/credit-packs.ts`):

```ts
export type CreditPack = { id: string; label: string; cents: number };

// Prepaid top-up options ($25 / $50 / $100 / $500 / $1,000). cents == the
// credit granted == the amount charged (1:1; we mark up at spend time, not here).
export const CREDIT_PACKS: CreditPack[] = [
  { id: "usd_25", label: "$25", cents: 2500 },
  { id: "usd_50", label: "$50", cents: 5000 },
  { id: "usd_100", label: "$100", cents: 10000 },
  { id: "usd_500", label: "$500", cents: 50000 },
  { id: "usd_1000", label: "$1,000", cents: 100000 },
];

export function packById(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}
```

- [ ] **Step 4: Run → PASS** (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/credit-packs.ts tests/lib/credit-packs.test.ts PRD/founder-score-api-billing.md
git commit -m "feat(billing): credit pack definitions"
```

---

### Task 3: Spend pricing (pure markup)

**Files:**
- Create: `src/lib/credit-pricing.ts`
- Test: `tests/lib/credit-pricing.test.ts`

- [ ] **Step 1: Failing test** (`tests/lib/credit-pricing.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { applyMarkup, SCORE_MARKUP } from "@/lib/credit-pricing";

describe("applyMarkup", () => {
  it("charges 10x measured cost, rounded to whole cents", () => {
    expect(SCORE_MARKUP).toBe(10);
    expect(applyMarkup(13)).toBe(130);
    expect(applyMarkup(35)).toBe(350);
    expect(applyMarkup(0)).toBe(0);
    expect(applyMarkup(7.4)).toBe(74); // 7.4*10 = 74
  });
  it("never returns a negative price", () => {
    expect(applyMarkup(-5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** (`src/lib/credit-pricing.ts`):

```ts
// Customers pay 10x our measured per-eval cost. The price for scoring a new
// person is applyMarkup(getEstimateCents(model)) — see POST /api/v1/score.
export const SCORE_MARKUP = 10;

export function applyMarkup(measuredCents: number): number {
  return Math.max(0, Math.round(measuredCents * SCORE_MARKUP));
}
```

- [ ] **Step 4: Run → PASS** (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/lib/credit-pricing.ts tests/lib/credit-pricing.test.ts PRD/founder-score-api-billing.md
git commit -m "feat(billing): 10x markup pricing helper"
```

---

### Task 4: Credits lib (balance / reserve / refund / top-up)

**Files:**
- Create: `src/lib/credits.ts`

DB-touching → verified by tsc + the route smoke tests later (repo unit-tests pure logic only).

- [ ] **Step 1: Implement** (`src/lib/credits.ts`):

```ts
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditBalances, creditLedger } from "@/db/schema";

export async function getBalanceCents(clerkUserId: string): Promise<number> {
  const [row] = await db
    .select({ cents: creditBalances.balanceCents })
    .from(creditBalances)
    .where(eq(creditBalances.clerkUserId, clerkUserId))
    .limit(1);
  return row?.cents ?? 0;
}

// Atomically reserve `cents`. Race-proof: the conditional UPDATE can't let two
// concurrent calls both overspend. Returns the ledger row id on success (so the
// caller can link it to the eval), or null when underfunded.
export async function reserveCredits(
  clerkUserId: string,
  cents: number,
): Promise<{ ledgerId: string; balanceAfter: number } | null> {
  const updated = await db
    .update(creditBalances)
    .set({ balanceCents: sql`${creditBalances.balanceCents} - ${cents}`, updatedAt: sql`NOW()` })
    .where(and(eq(creditBalances.clerkUserId, clerkUserId), sql`${creditBalances.balanceCents} >= ${cents}`))
    .returning({ balanceAfter: creditBalances.balanceCents });
  if (updated.length === 0) return null;
  const balanceAfter = updated[0]!.balanceAfter;
  const [led] = await db
    .insert(creditLedger)
    .values({ clerkUserId, deltaCents: -cents, reason: "score_debit", balanceAfterCents: balanceAfter })
    .returning({ id: creditLedger.id });
  return { ledgerId: led!.id, balanceAfter };
}

// Link a successful score_debit to the eval it paid for (audit).
export async function linkDebitEvaluation(ledgerId: string, evaluationId: string): Promise<void> {
  await db.update(creditLedger).set({ evaluationId }).where(eq(creditLedger.id, ledgerId));
}

// Refund a previously-reserved amount (e.g. the score failed). Increments the
// balance and appends a 'refund' row referencing the same eval (if any).
export async function refundCredits(
  clerkUserId: string,
  cents: number,
  evaluationId: string | null,
): Promise<void> {
  const updated = await db
    .update(creditBalances)
    .set({ balanceCents: sql`${creditBalances.balanceCents} + ${cents}`, updatedAt: sql`NOW()` })
    .where(eq(creditBalances.clerkUserId, clerkUserId))
    .returning({ balanceAfter: creditBalances.balanceCents });
  const balanceAfter = updated[0]?.balanceAfter ?? cents;
  await db.insert(creditLedger).values({
    clerkUserId, deltaCents: cents, reason: "refund", evaluationId, balanceAfterCents: balanceAfter,
  });
}

// Grant credits from a completed Stripe payment. Idempotent on the payment
// intent id: if a topup ledger row already exists for it, do nothing (the
// webhook can be retried). Upserts the balance row.
export async function topUpCredits(
  clerkUserId: string,
  cents: number,
  paymentIntentId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(eq(creditLedger.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  if (existing) return; // already applied
  const updated = await db
    .insert(creditBalances)
    .values({ clerkUserId, balanceCents: cents })
    .onConflictDoUpdate({
      target: creditBalances.clerkUserId,
      set: { balanceCents: sql`${creditBalances.balanceCents} + ${cents}`, updatedAt: sql`NOW()` },
    })
    .returning({ balanceAfter: creditBalances.balanceCents });
  const balanceAfter = updated[0]?.balanceAfter ?? cents;
  await db.insert(creditLedger).values({
    clerkUserId, deltaCents: cents, reason: "topup", stripePaymentIntentId: paymentIntentId,
    balanceAfterCents: balanceAfter,
  });
}
```

- [ ] **Step 2: Typecheck** — `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 3: Commit**
```bash
git add src/lib/credits.ts PRD/founder-score-api-billing.md
git commit -m "feat(billing): credits lib (balance/reserve/refund/topup)"
```

> NOTE on atomicity: the Neon HTTP driver runs each statement separately. The reserve's conditional `UPDATE ... WHERE balance >= cents` is a single atomic statement (the oversell guard). The ledger insert is best-effort after it; the `credit_balances` row is the source of truth. A rare decrement-without-ledger-row is acceptable for v1 (audit-only gap). Do NOT try to wrap these in an interactive transaction (neon-http doesn't support it).

---

### Task 5: Stripe client

**Files:**
- Create: `src/lib/stripe.ts`

- [ ] **Step 1: Implement** (`src/lib/stripe.ts`):

```ts
import Stripe from "stripe";

let cached: Stripe | null = null;

// Lazy singleton. Throws only when actually used without a key (so importing
// this module never crashes builds where Stripe isn't configured yet).
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  cached = new Stripe(key);
  return cached;
}
```

- [ ] **Step 2: Typecheck** — `pnpm exec tsc --noEmit` → clean (depends on Task 1's `pnpm add stripe`).

- [ ] **Step 3: Commit**
```bash
git add src/lib/stripe.ts PRD/founder-score-api-billing.md
git commit -m "feat(billing): lazy Stripe client"
```

---

### Task 6: `POST /api/developers/checkout` (create a Checkout session)

**Files:**
- Create: `src/app/api/developers/checkout/route.ts`

Clerk-auth'd (the dashboard calls it). DB/Stripe-touching → verified by tsc + manual test (needs `STRIPE_SECRET_KEY`).

- [ ] **Step 1: Implement:**

```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStripe } from "@/lib/stripe";
import { packById } from "@/lib/credit-packs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { packId?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }
  const pack = body.packId ? packById(body.packId) : undefined;
  if (!pack) return NextResponse.json({ error: "invalid packId" }, { status: 400 });

  const origin = new URL(req.url).origin;
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: pack.cents,
        product_data: { name: `Founder Festival API credits — ${pack.label}` },
      },
    }],
    // The webhook grants credits; metadata carries who + how much.
    metadata: { clerkUserId: userId, packId: pack.id, credits_cents: String(pack.cents) },
    payment_intent_data: { metadata: { clerkUserId: userId, credits_cents: String(pack.cents) } },
    success_url: `${origin}/developers?topup=success`,
    cancel_url: `${origin}/developers?topup=cancel`,
  });
  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 2: Typecheck** → clean.

- [ ] **Step 3: Manual test (after `STRIPE_SECRET_KEY` test-mode is set + dev server running, signed in):** in the browser dev console while on `/developers`:
  `fetch("/api/developers/checkout",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({packId:"usd_25"})}).then(r=>r.json()).then(console.log)` → returns `{ url: "https://checkout.stripe.com/..." }`. (Without a key, expect a 500 from `getStripe()` — that's the unset-key guard.) Report the outcome.

- [ ] **Step 4: Commit**
```bash
git add src/app/api/developers/checkout/route.ts PRD/founder-score-api-billing.md
git commit -m "feat(billing): POST /api/developers/checkout"
```

---

### Task 7: `POST /api/stripe/webhook` (grant credits, idempotent)

**Files:**
- Create: `src/app/api/stripe/webhook/route.ts`

- [ ] **Step 1: Implement:**

```ts
import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { topUpCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

// Stripe posts here on payment events. We verify the signature, then on a
// completed checkout grant credits to the buyer (idempotent on payment_intent).
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 500 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text(); // raw body required for signature verification
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as {
      payment_intent?: string | { id: string } | null;
      amount_total?: number | null;
      metadata?: Record<string, string> | null;
    };
    const clerkUserId = s.metadata?.clerkUserId;
    const credits = Number(s.metadata?.credits_cents ?? s.amount_total ?? 0);
    const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
    if (clerkUserId && credits > 0 && pi) {
      await topUpCredits(clerkUserId, credits, pi);
    }
  }
  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Typecheck** → clean.

- [ ] **Step 3: Manual test (needs Stripe CLI):** run `stripe listen --forward-to localhost:3000/api/stripe/webhook` (prints the `whsec_...` → put in `.env.local` as `STRIPE_WEBHOOK_SECRET`, restart dev). Complete a test checkout from Task 6; confirm a `credit_balances` row appears for your Clerk id with the pack cents, and one `topup` ledger row. Re-send the same event via `stripe events resend <id>` → balance does NOT double (idempotency). Report results.

- [ ] **Step 4: Commit**
```bash
git add src/app/api/stripe/webhook/route.ts PRD/founder-score-api-billing.md
git commit -m "feat(billing): Stripe webhook grants credits (idempotent)"
```

---

### Task 8: Paid path on `POST /api/v1/score` + `GET /api/v1/credits`

**Files:**
- Modify: `src/app/api/v1/score/route.ts` (add `POST`)
- Create: `src/app/api/v1/credits/route.ts` (add `GET`)

- [ ] **Step 1: Add `POST` to `src/app/api/v1/score/route.ts`** (keep the existing imports + `GET`; add these imports at top and the handler below it):

```ts
// add to imports:
import { getEstimateCents } from "@/lib/admin";
import { applyMarkup } from "@/lib/credit-pricing";
import { reserveCredits, refundCredits, linkDebitEvaluation, getBalanceCents } from "@/lib/credits";
import { runEval } from "@/lib/eval-pipeline";
import { lookupCachedEval } from "@/lib/eval-pipeline";
```

```ts
// POST /api/v1/score  { linkedin_url, mode?: "cached_only" | "score_if_needed" }
// Cache hit → free. Miss + cached_only → 404. Miss + score_if_needed → reserve
// 10x measured cost, score, refund on failure.
export async function POST(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });

  let body: { linkedin_url?: string; mode?: string } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const url = body.linkedin_url;
  if (!url || !isValidLinkedinUrl(url)) {
    return NextResponse.json({ error: "invalid linkedin_url" }, { status: 400 });
  }
  if (!(await checkAndIncrementRateLimit(`apikey:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json({ error: "rate_limit", resetsAt: "midnight UTC" }, { status: 429 });
  }

  // Free cache hit regardless of mode.
  const cached = await fetchScorePayload(url);
  if (cached) return NextResponse.json(cached);

  if (body.mode !== "score_if_needed") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Paid path.
  const price = applyMarkup(await getEstimateCents("sonnet"));
  const reservation = await reserveCredits(key.clerkUserId, price);
  if (!reservation) {
    const balance = await getBalanceCents(key.clerkUserId);
    return NextResponse.json(
      { error: "payment_required", price_cents: price, balance_cents: balance, topup_url: `${new URL(req.url).origin}/developers` },
      { status: 402 },
    );
  }
  try {
    const result = await runEval(url, "url", { model: "sonnet" });
    await linkDebitEvaluation(reservation.ledgerId, result.evaluationId);
    const payload = await fetchScorePayload(url, { cached: false, chargedCents: price });
    return NextResponse.json(payload);
  } catch (err) {
    console.error("paid score failed", err);
    await refundCredits(key.clerkUserId, price, null);
    return NextResponse.json({ error: "scoring_failed" }, { status: 503 });
  }
}
```

NOTE: confirm `runEval(...)` returns an object with `evaluationId` (it returns an `EvalResult`; the cron uses `result.evaluationId`). If the property name differs, adjust `linkDebitEvaluation(reservation.ledgerId, result.evaluationId)` to the actual field — do not invent one.

- [ ] **Step 2: Create `GET /api/v1/credits`** (`src/app/api/v1/credits/route.ts`) — API-key-authed balance for programmatic use:

```ts
import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { getBalanceCents } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  const balance_cents = await getBalanceCents(key.clerkUserId);
  return NextResponse.json({ balance_cents });
}
```

- [ ] **Step 3: Typecheck + lint** — `pnpm exec tsc --noEmit && pnpm exec eslint src/app/api/v1/score/route.ts src/app/api/v1/credits/route.ts` → clean.

- [ ] **Step 4: Manual test (seed a balance WITHOUT Stripe):** insert a balance row for the test key's owner, then exercise the paths. Using the Phase-1 dev key owner `dev-test-user`:
  `DOTENV_CONFIG_PATH=.env.local pnpm exec tsx -e "import('@/db').then(async({db})=>{const{creditBalances}=await import('@/db/schema');await db.insert(creditBalances).values({clerkUserId:'dev-test-user',balanceCents:100000}).onConflictDoUpdate({target:creditBalances.clerkUserId,set:{balanceCents:100000}});console.log('seeded');process.exit(0)})"`
  Then with `KEY` = the Phase-1 dev key:
  - `GET /api/v1/credits` with the key → `{ balance_cents: 100000 }`.
  - `POST /api/v1/score` `{linkedin_url:"https://linkedin.com/in/barmstrong"}` (cached) → 200, `cached:true`, no charge.
  - `POST` `{linkedin_url:"https://linkedin.com/in/<someone-NOT-scored>", mode:"score_if_needed"}` → 200 with a fresh score, `cost.charged_cents > 0`; `GET /api/v1/credits` shows the balance dropped by that amount.
  - Set balance to 0, repeat the paid call → `402 payment_required`.
  Report the actual outputs.

- [ ] **Step 5: Commit**
```bash
git add src/app/api/v1/score/route.ts src/app/api/v1/credits/route.ts PRD/founder-score-api-billing.md
git commit -m "feat(billing): paid POST /api/v1/score (reserve/refund) + GET /api/v1/credits"
```

---

### Task 9: Dashboard — balance + buy-credits

**Files:**
- Modify: `src/components/developers/DeveloperConsole.tsx` (add a Credits section)
- Create: `src/app/api/developers/credits/route.ts` (Clerk-auth'd balance + recent ledger for the dashboard)

- [ ] **Step 1: Create the dashboard balance route** (`src/app/api/developers/credits/route.ts`):

```ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditLedger } from "@/db/schema";
import { getBalanceCents } from "@/lib/credits";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const balance_cents = await getBalanceCents(userId);
  const ledger = await db
    .select({ deltaCents: creditLedger.deltaCents, reason: creditLedger.reason, createdAt: creditLedger.createdAt })
    .from(creditLedger)
    .where(eq(creditLedger.clerkUserId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(10);
  return NextResponse.json({ balance_cents, ledger });
}
```

- [ ] **Step 2: Add a Credits section to `DeveloperConsole.tsx`** — between Step 2 (keys) and the Markdown section. Add state + loaders and render: current balance (formatted `$${(cents/100).toFixed(2)}`), the five pack buttons (from a small inline list mirroring `CREDIT_PACKS` ids/labels — import `CREDIT_PACKS` from `@/lib/credit-packs`), and a recent-ledger list. Pack click → `POST /api/developers/checkout {packId}` → `window.location.href = data.url`. On mount (signed in) → `GET /api/developers/credits` to populate balance + ledger. If `?topup=success` is in the URL, show a "Credits added" note and refresh balance. Keep it one cohesive `<section>` consistent with the existing dark-theme styling (`bg-zinc-900/...`, gold `#dfa43a` buttons).

```tsx
// sketch of the handlers (place inside DeveloperConsole):
import { CREDIT_PACKS } from "@/lib/credit-packs";
// ...
const [balanceCents, setBalanceCents] = useState<number | null>(null);
async function loadCredits() {
  const res = await fetch("/api/developers/credits");
  if (res.ok) { const d = await res.json(); setBalanceCents(d.balance_cents); }
}
async function buy(packId: string) {
  const res = await fetch("/api/developers/checkout", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packId }),
  });
  const d = await res.json();
  if (d.url) window.location.href = d.url; else setError(d.error ?? "Checkout failed");
}
// useEffect(load on signed in); render balance + CREDIT_PACKS.map(p => <button onClick={()=>buy(p.id)}>{p.label}</button>)
```

- [ ] **Step 3: Typecheck + lint** → clean.

- [ ] **Step 4: Manual test:** `/developers` (signed in) shows the seeded balance; clicking a pack hits checkout (redirects to Stripe when a key is set, or shows the error when not). `curl` the dashboard route unauthenticated → 401.

- [ ] **Step 5: Commit**
```bash
git add src/components/developers/DeveloperConsole.tsx src/app/api/developers/credits/route.ts PRD/founder-score-api-billing.md
git commit -m "feat(billing): dashboard balance + buy-credits"
```

---

## Self-review checklist (run before opening a PR)

- [ ] `pnpm exec tsc --noEmit` clean; `pnpm exec eslint <new files>` clean; new unit tests (credit-packs, credit-pricing) pass.
- [ ] Reserve is a single conditional `UPDATE` (oversell-proof); failed scores refund (net zero); webhook is idempotent on `payment_intent`.
- [ ] No secret leakage: balance/ledger endpoints are auth-gated (Clerk for dashboard routes, API key for `/api/v1/*`); webhook verifies the Stripe signature.
- [ ] PRD updated each commit; migration applied to dev.

## Release notes (when merging to prod)
- Apply the credit-tables migration to the **prod** DB (`ep-fragrant-surf`) before merge (no auto-migrate).
- Set `STRIPE_SECRET_KEY` (live) + `STRIPE_WEBHOOK_SECRET` (live) in Vercel prod env; register the prod webhook endpoint in the Stripe dashboard → `https://<prod-domain>/api/stripe/webhook` for `checkout.session.completed`.

## Out of scope (later)
- Auto-refill / low-balance email. Spend analytics. Invoices/receipts UI (Stripe emails them). Per-key spend caps. The `test` key tier (`sk_festival_test_`).

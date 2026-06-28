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

// Atomically reserve `cents` against a balance for an arbitrary `reason`
// (e.g. "find_email_debit"). Same race-proof conditional UPDATE as reserveCredits;
// returns null when underfunded so the caller can stop the batch.
export async function reserveCreditsFor(
  clerkUserId: string,
  cents: number,
  reason: string,
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
    .values({ clerkUserId, deltaCents: -cents, reason, balanceAfterCents: balanceAfter })
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

// Look up the original "topup" grant for a Stripe payment intent. Used by the
// webhook's refund/dispute path to find WHO to claw back from and HOW MUCH was
// granted — the charge/dispute event objects don't carry our clerkUserId
// metadata (only the original checkout.session did), so we resolve it from the
// ledger row that topUpCredits wrote.
export async function getTopUpByPaymentIntent(
  paymentIntentId: string,
): Promise<{ clerkUserId: string; grantedCents: number } | null> {
  const [row] = await db
    .select({ clerkUserId: creditLedger.clerkUserId, grantedCents: creditLedger.deltaCents })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.stripePaymentIntentId, paymentIntentId),
        eq(creditLedger.reason, "topup"),
      ),
    )
    .limit(1);
  return row ? { clerkUserId: row.clerkUserId, grantedCents: row.grantedCents } : null;
}

// Reverse a Stripe topup when the payment is refunded or charged back. The
// inverse of topUpCredits and idempotent the same way: the ledger insert is the
// gate, keyed on a SYNTHETIC `${pi}:refund` payment-intent id so it (a) reuses
// the existing unique index for idempotency and (b) never collides with the
// original `${pi}` topup row. Duplicate refund/dispute deliveries lose the insert
// and bail before touching the balance.
//
// The balance is allowed to go NEGATIVE: if the buyer already spent the credits
// before clawing the money back, honest accounting leaves them in debt — and
// reserveCredits' `>= cents` guard blocks any further paid work until they
// re-fund, so a negative balance is self-limiting (no further spend possible).
export async function reverseTopUp(
  clerkUserId: string,
  cents: number,
  paymentIntentId: string,
): Promise<void> {
  if (cents <= 0) return;
  const claimed = await db
    .insert(creditLedger)
    .values({
      clerkUserId,
      deltaCents: -cents,
      reason: "stripe_refund",
      stripePaymentIntentId: `${paymentIntentId}:refund`,
      balanceAfterCents: 0,
    })
    .onConflictDoNothing({ target: creditLedger.stripePaymentIntentId })
    .returning({ id: creditLedger.id });
  if (claimed.length === 0) return; // already reversed (retry or concurrent delivery)

  const updated = await db
    .insert(creditBalances)
    .values({ clerkUserId, balanceCents: -cents })
    .onConflictDoUpdate({
      target: creditBalances.clerkUserId,
      set: { balanceCents: sql`${creditBalances.balanceCents} - ${cents}`, updatedAt: sql`NOW()` },
    })
    .returning({ balanceAfter: creditBalances.balanceCents });
  const balanceAfter = updated[0]?.balanceAfter ?? -cents;
  await db
    .update(creditLedger)
    .set({ balanceAfterCents: balanceAfter })
    .where(eq(creditLedger.id, claimed[0]!.id));
}

// Grant credits from a completed Stripe payment. Idempotent on the payment
// intent id: if a topup ledger row already exists for it, do nothing (the
// webhook can be retried). Upserts the balance row.
export async function topUpCredits(
  clerkUserId: string,
  cents: number,
  paymentIntentId: string,
): Promise<void> {
  // The ledger insert is the idempotency GATE. A unique index on
  // stripe_payment_intent_id means only ONE call for a given payment can insert
  // — concurrent/duplicate webhook deliveries lose the insert and bail before
  // touching the balance, so credits can never be double-granted (a plain
  // SELECT-then-INSERT would race). balanceAfterCents is backfilled below.
  const claimed = await db
    .insert(creditLedger)
    .values({
      clerkUserId,
      deltaCents: cents,
      reason: "topup",
      stripePaymentIntentId: paymentIntentId,
      balanceAfterCents: 0,
    })
    .onConflictDoNothing({ target: creditLedger.stripePaymentIntentId })
    .returning({ id: creditLedger.id });
  if (claimed.length === 0) return; // already applied (retry or concurrent delivery)

  const updated = await db
    .insert(creditBalances)
    .values({ clerkUserId, balanceCents: cents })
    .onConflictDoUpdate({
      target: creditBalances.clerkUserId,
      set: { balanceCents: sql`${creditBalances.balanceCents} + ${cents}`, updatedAt: sql`NOW()` },
    })
    .returning({ balanceAfter: creditBalances.balanceCents });
  const balanceAfter = updated[0]?.balanceAfter ?? cents;
  await db
    .update(creditLedger)
    .set({ balanceAfterCents: balanceAfter })
    .where(eq(creditLedger.id, claimed[0]!.id));
}

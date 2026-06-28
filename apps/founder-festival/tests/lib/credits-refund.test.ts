import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { creditLedger } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  topUpCredits,
  reverseTopUp,
  getTopUpByPaymentIntent,
  getBalanceCents,
  reserveCredits,
} from "@/lib/credits";
import { IS_PROD_DB } from "../setup";

// P0-3: a Stripe refund / chargeback used to keep its credits — the webhook only
// handled checkout.session.completed, so charge.refunded / dispute events were
// signature-verified then ignored. reverseTopUp + getTopUpByPaymentIntent are the
// inverse-ledger primitives the webhook now uses to claw the credits back, keyed
// idempotently on a synthetic `${pi}:refund` so duplicate webhook deliveries
// can't double-debit.

function uid() {
  return "user_refund_" + Math.random().toString(36).slice(2, 10);
}
function pi() {
  return "pi_" + Math.random().toString(36).slice(2, 12);
}

describe.skipIf(IS_PROD_DB)("getTopUpByPaymentIntent", () => {
  it("finds the original grant (owner + cents) by payment intent", async () => {
    const clerkUserId = uid();
    const paymentIntent = pi();
    await topUpCredits(clerkUserId, 2500, paymentIntent);

    const found = await getTopUpByPaymentIntent(paymentIntent);
    expect(found).toEqual({ clerkUserId, grantedCents: 2500 });
  });

  it("returns null for an unknown payment intent", async () => {
    expect(await getTopUpByPaymentIntent(pi())).toBeNull();
  });
});

describe.skipIf(IS_PROD_DB)("reverseTopUp", () => {
  it("debits the balance and records a stripe_refund ledger row", async () => {
    const clerkUserId = uid();
    const paymentIntent = pi();
    await topUpCredits(clerkUserId, 2500, paymentIntent);
    expect(await getBalanceCents(clerkUserId)).toBe(2500);

    await reverseTopUp(clerkUserId, 2500, paymentIntent);
    expect(await getBalanceCents(clerkUserId)).toBe(0);

    const rows = await db.select().from(creditLedger).where(eq(creditLedger.clerkUserId, clerkUserId));
    const refundRow = rows.find((r) => r.reason === "stripe_refund");
    expect(refundRow).toBeTruthy();
    expect(refundRow!.deltaCents).toBe(-2500);
    expect(refundRow!.stripePaymentIntentId).toBe(`${paymentIntent}:refund`);
  });

  it("is idempotent: a duplicate refund event does not double-debit", async () => {
    const clerkUserId = uid();
    const paymentIntent = pi();
    await topUpCredits(clerkUserId, 2500, paymentIntent);

    await reverseTopUp(clerkUserId, 2500, paymentIntent);
    await reverseTopUp(clerkUserId, 2500, paymentIntent); // duplicate delivery

    expect(await getBalanceCents(clerkUserId)).toBe(0); // not -2500
    const rows = await db.select().from(creditLedger).where(eq(creditLedger.clerkUserId, clerkUserId));
    expect(rows.filter((r) => r.reason === "stripe_refund")).toHaveLength(1);
  });

  it("allows the balance to go negative when the credits were already spent", async () => {
    const clerkUserId = uid();
    const paymentIntent = pi();
    await topUpCredits(clerkUserId, 2500, paymentIntent);
    // Spend most of it before the chargeback lands.
    await reserveCredits(clerkUserId, 2000);
    expect(await getBalanceCents(clerkUserId)).toBe(500);

    await reverseTopUp(clerkUserId, 2500, paymentIntent);
    // Honest accounting: they clawed back money for credits they already used.
    expect(await getBalanceCents(clerkUserId)).toBe(-2000);
  });
});

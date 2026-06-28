import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { topUpCredits, reverseTopUp, getTopUpByPaymentIntent } from "@/lib/credits";
import { sendAdminAlert, alertConfigured } from "@/lib/admin-alert";

export const dynamic = "force-dynamic";

// Pull the payment-intent id off a charge/dispute object (string or expanded).
function piId(v: string | { id: string } | null | undefined): string | undefined {
  return typeof v === "string" ? v : v?.id;
}

// A refund or chargeback clawed money back, so the credits granted for that
// payment must be reversed. We resolve the original grant from the ledger (the
// charge/dispute event doesn't carry our clerkUserId), claw back the lesser of
// what was refunded and what was granted, and alert an operator. Idempotent on
// `${pi}:refund` inside reverseTopUp, so duplicate deliveries are safe.
async function handleClawback(paymentIntentId: string, refundedCents: number, kind: string) {
  const grant = await getTopUpByPaymentIntent(paymentIntentId);
  if (!grant) return; // no credits were ever granted for this PI (e.g. non-credit charge)
  const clawback = Math.min(refundedCents > 0 ? refundedCents : grant.grantedCents, grant.grantedCents);
  await reverseTopUp(grant.clerkUserId, clawback, paymentIntentId);
  if (alertConfigured()) {
    await sendAdminAlert({
      subject: `Stripe ${kind}: clawed back ${clawback}¢ from ${grant.clerkUserId}`,
      html:
        `<p>A Stripe <b>${kind}</b> on payment intent <code>${paymentIntentId}</code> ` +
        `reversed <b>${clawback}¢</b> of credits from <code>${grant.clerkUserId}</code> ` +
        `(original grant ${grant.grantedCents}¢). Their balance may now be negative if ` +
        `they had already spent the credits.</p>`,
    }).catch(() => null); // alerting must never fail the webhook (Stripe would retry)
  }
}

// Stripe posts here on payment events. We verify the signature, then on a
// completed checkout grant credits to the buyer (idempotent on payment_intent),
// and on a refund/dispute reverse those credits (idempotent on `${pi}:refund`).
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 500 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text(); // raw body required for signature verification
  let event;
  try {
    event = await getStripe().webhooks.constructEventAsync(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as {
      payment_intent?: string | { id: string } | null;
      amount_total?: number | null;
      payment_status?: string | null;
      metadata?: Record<string, string> | null;
    };
    const clerkUserId = s.metadata?.clerkUserId;
    const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
    // Only grant on money actually collected. "money in = credits granted" is the
    // invariant: derive the grant from amount_total (what Stripe charged), and
    // treat metadata.credits_cents as an UPPER bound only — so a discounted /
    // partial / future-coupon checkout can never mint more credits than was paid,
    // even though the event is signature-verified.
    const amountPaid = Number(s.amount_total ?? 0);
    const claimed = Number(s.metadata?.credits_cents ?? amountPaid);
    const credits = Math.min(amountPaid, claimed);
    if (s.payment_status === "paid" && clerkUserId && credits > 0 && pi) {
      await topUpCredits(clerkUserId, credits, pi);
    }
  } else if (event.type === "charge.refunded") {
    // Cumulative amount_refunded on the charge; cap the clawback at the grant.
    const c = event.data.object as {
      payment_intent?: string | { id: string } | null;
      amount_refunded?: number | null;
    };
    const pi = piId(c.payment_intent);
    if (pi) await handleClawback(pi, Number(c.amount_refunded ?? 0), "refund");
  } else if (event.type === "charge.dispute.created") {
    // A chargeback: reverse the disputed amount (defaults to the full grant).
    const d = event.data.object as {
      payment_intent?: string | { id: string } | null;
      amount?: number | null;
    };
    const pi = piId(d.payment_intent);
    if (pi) await handleClawback(pi, Number(d.amount ?? 0), "dispute");
  }
  return NextResponse.json({ received: true });
}

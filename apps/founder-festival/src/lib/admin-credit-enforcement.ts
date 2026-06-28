// Phase 3 admin credit enforcement. OFF by default — when off, bulk scoring does
// not touch credits at all (no reserve, no debit), so prod behaviour is exactly
// as before. Flip ADMIN_CREDIT_ENFORCEMENT=on (Vercel env) to enable charging.
//
// Model: at job creation we RESERVE multiplier × estimated cost from the
// creator's balance (blocking the job if they can't afford it). At job
// completion we RECONCILE the hold down to the real cost (prorated by
// actual/estimate, which equals multiplier × actual) and refund the difference.
// A cancelled/failed job refunds the whole hold.

export function adminCreditEnforcementEnabled(): boolean {
  const v = (process.env.ADMIN_CREDIT_ENFORCEMENT ?? "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

// Reconcile a credit hold against the job's real cost. The hold was reserved as
// multiplier × estimatedCents, so the fair charge = hold × (actual / estimate) =
// multiplier × actualCents. We cap the charge at the hold (never charge more than
// was reserved) and refund the rest. Returns the cents to refund to the creator.
export function reconcileHold(opts: {
  holdCents: number;
  estimatedCents: number;
  actualCents: number;
}): { refundCents: number } {
  const { holdCents, estimatedCents, actualCents } = opts;
  if (holdCents <= 0) return { refundCents: 0 };
  // No usable estimate to prorate against → refund everything (can't fairly charge).
  if (estimatedCents <= 0) return { refundCents: holdCents };
  const fairCharge = Math.min(holdCents, Math.round((holdCents * actualCents) / estimatedCents));
  return { refundCents: holdCents - fairCharge };
}

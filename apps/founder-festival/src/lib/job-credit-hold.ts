import { adminCreditEnforcementEnabled } from "@/lib/admin-credit-enforcement";
import { getViewerCostMultiplier, viewerIsPrivileged } from "@/lib/grants";
import { applyCostMultiplier } from "@/lib/cost-multiplier";
import { reserveCredits, getBalanceCents } from "@/lib/credits";

export type JobHoldResult =
  | { kind: "ok"; creditHoldCents: number | null }
  | { kind: "insufficient"; balanceCents: number; neededCents: number };

// Reserve credits for a new bulk job (initial run or re-run) when admin credit
// enforcement is on. The hold is the creator's cost multiplier × the estimate;
// it's reconciled to real cost (and the difference refunded) at completion. The
// caller stores the returned hold on the job and turns an "insufficient" result
// into a 402 so the job is never created when it can't be paid for.
//
// No-op (null hold, no debit) when: enforcement is off (prod default), there's
// no clerk user, or the viewer is privileged (super/env admins are never
// credit-blocked, so the operator can't lock themselves out).
export async function holdCreditsForJob(
  clerkUserId: string | null,
  estimateCents: number | null,
): Promise<JobHoldResult> {
  if (!adminCreditEnforcementEnabled() || !clerkUserId) return { kind: "ok", creditHoldCents: null };
  if (await viewerIsPrivileged()) return { kind: "ok", creditHoldCents: null };
  const mult = await getViewerCostMultiplier();
  const hold = applyCostMultiplier(estimateCents ?? 0, mult) ?? 0;
  if (hold <= 0) return { kind: "ok", creditHoldCents: null };
  const reservation = await reserveCredits(clerkUserId, hold);
  if (!reservation) {
    return { kind: "insufficient", balanceCents: await getBalanceCents(clerkUserId), neededCents: hold };
  }
  return { kind: "ok", creditHoldCents: hold };
}

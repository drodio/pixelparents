import type { AmfResult } from "./anymailfinder";

// $0.05 per email found, charged to the acting admin's credit balance.
export const FIND_EMAIL_CHARGE_CENTS = 5;

export type FindEmailOutcome = { store: boolean; email: string | null; chargeCents: number };

// Decide what to do with ONE AnyMailFinder result. Store + charge only on a
// "valid" hit (matching AnyMailFinder's own per-find billing); super-admins are
// never charged. Anything else (risky / not_found / blacklisted) → no store, no charge.
export function findEmailOutcome(result: AmfResult, opts: { superAdmin: boolean }): FindEmailOutcome {
  if (result.status === "valid" && result.email) {
    return {
      store: true,
      email: result.email,
      chargeCents: opts.superAdmin ? 0 : FIND_EMAIL_CHARGE_CENTS,
    };
  }
  return { store: false, email: null, chargeCents: 0 };
}

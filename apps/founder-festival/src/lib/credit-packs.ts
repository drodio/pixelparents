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

// A Chief "Deep Intelligence" dossier costs a flat $50. Kept here (client-safe,
// no server imports) so both the run endpoint and the credits modal agree.
export const DOSSIER_COST_CENTS = 5000;

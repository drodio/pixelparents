// Single owner for parsing the evaluations.breakdown JSONB into founder/investor
// rows. `breakdown` is `unknown` because it's either the current
// `{ founder, investor }` shape or a LEGACY flat array (pre-investor-rubric),
// which is treated as founder rows only. Re-implementing this per call site is
// how investor rows silently got dropped on the legacy path — so everyone reads
// through here. Pure + dependency-free (safe to import from client components).

export type BreakdownRow = {
  points: number;
  reason: string;
  confidence?: number;
  verification?: string;
  sources?: string[];
};

function rowsFor(breakdown: unknown, dim: "founder" | "investor"): BreakdownRow[] {
  if (!breakdown) return [];
  // Legacy flat array = founder rows; investor is empty (NOT the array).
  if (Array.isArray(breakdown)) return dim === "founder" ? (breakdown as BreakdownRow[]) : [];
  const arr = (breakdown as { founder?: BreakdownRow[]; investor?: BreakdownRow[] })[dim];
  return Array.isArray(arr) ? arr : [];
}

export const founderRows = (breakdown: unknown): BreakdownRow[] => rowsFor(breakdown, "founder");
export const investorRows = (breakdown: unknown): BreakdownRow[] => rowsFor(breakdown, "investor");

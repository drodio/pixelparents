// Per-role cost multiplier. Some admin roles are shown (and, in Phase 3, charged)
// inflated costs: everything cost-related is multiplied by the role's multiplier.
// Super-admins / env-admins (and legacy no-role admins) see real costs (×1).
// Pure helpers — no DB/React — so they're testable and shared everywhere costs
// are displayed.

export const DEFAULT_COST_MULTIPLIER = 10;
export const MIN_COST_MULTIPLIER = 1;

// Normalize a stored/submitted multiplier: integer ≥ 1; non-numbers → default.
export function clampCostMultiplier(n: unknown): number {
  if (n == null) return DEFAULT_COST_MULTIPLIER; // Number(null) === 0, so guard explicitly
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return DEFAULT_COST_MULTIPLIER;
  return Math.max(MIN_COST_MULTIPLIER, Math.trunc(v));
}

// Multiply a cents amount for display/charging. null/undefined (unknown cost)
// passes through as null so the UI keeps showing "—".
export function applyCostMultiplier(
  cents: number | null | undefined,
  mult: number,
): number | null {
  if (cents == null) return null;
  return Math.round(cents * mult);
}

// The viewer's effective multiplier. Privileged viewers (super-admin / env
// admin) and legacy no-role admins are ×1; a role-based admin uses their role's
// multiplier (clamped ≥ 1).
export function effectiveCostMultiplier(opts: {
  privileged: boolean;
  roleMultiplier: number | null;
}): number {
  if (opts.privileged) return 1;
  if (opts.roleMultiplier == null) return 1;
  return clampCostMultiplier(opts.roleMultiplier);
}

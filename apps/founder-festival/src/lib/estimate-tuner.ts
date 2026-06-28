// Pure estimate-tuning math. Kept free of DB/Clerk imports so it is trivially
// unit-testable; the DB-backed `getEstimateCents(model)` that feeds it real
// samples lives in src/lib/admin.ts.
//
// We use the MEDIAN (not the mean) of recent actuals: a single runaway eval —
// a profile that triggered an unusually long Claude response — shouldn't drag
// the whole forward estimate up.

// Median of a list of integer cents, rounded to whole cents. Empty list → 0.
export function medianCents(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// Returns the tuned per-eval estimate in cents: the median of observed actuals
// once we have at least `minSamples`, otherwise the flat fallback constant.
export function pickEstimateCents(
  samplesCents: number[],
  fallbackCents: number,
  minSamples = 5,
): number {
  if (samplesCents.length < minSamples) return fallbackCents;
  return medianCents(samplesCents);
}

// Customers are charged a markup on our measured per-eval cost. The price for
// scoring a new person is applyMarkup(getEstimateCents(model)) — see POST
// /api/v1/score. Public copy frames this as "variable, typically $1-$5 per
// record" rather than exposing the exact multiplier.
export const SCORE_MARKUP = 10;

export function applyMarkup(measuredCents: number): number {
  return Math.max(0, Math.round(measuredCents * SCORE_MARKUP));
}

// Cost accounting for a scoring run: model pricing constants, the per-eval
// pricing summary types, token→USD math, and the JSONB+cents field builder.
// Split out of eval-pipeline.ts. `ScoringModel` is a type-only import from the
// orchestrator (erased at compile → no runtime cycle).
import type { ExaUsage } from "./exa-cost";
import type { ScoringModel } from "./eval-pipeline";

// Anthropic published pricing per 1M tokens (USD). Used to compute the
// actual cost of each scoring call from `result.usage`, which gets stored
// on `profile.usage` so the admin /admin/profiles cost estimate can be tuned
// against real data over time.
const MODEL_PRICING_USD_PER_1M: Record<ScoringModel, { input: number; output: number; cachedRead: number }> = {
  haiku: { input: 1, output: 5, cachedRead: 0.1 },
  sonnet: { input: 3, output: 15, cachedRead: 0.3 },
  opus: { input: 15, output: 75, cachedRead: 1.5 },
};

export type ScoringUsage = {
  model: ScoringModel;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  // Actual cost. Sourced from the Vercel AI Gateway's reported per-generation
  // cost (providerMetadata.gateway.cost) when available — the authoritative
  // billed amount, accounting for cache discounts/tiers. Falls back to the
  // token×published-price estimate only if the gateway omits cost.
  costUsd: number;
  costSource: "gateway" | "estimated";
  // Vercel generation id (gen_<ulid>) for traceability / drill-down. Present
  // when the gateway returns it.
  generationId?: string;
};

// Canonical per-eval cost summary persisted to evaluations.pricing (JSONB) and
// mirrored to the cost_*_cents integer columns. `llm` is null when no Claude
// call happened (low-signal short-circuit). totalUsd = llm.costUsd + exa.costUsd.
export type EvalPricing = {
  version: 1;
  llm: ScoringUsage | null;
  exa: ExaUsage;
  totalUsd: number;
};

// Build the pricing JSONB blob plus its denormalized integer-cents mirrors.
// Cents are rounded per-row; the JSONB keeps exact USD as the source of truth.
export function buildCostFields(llm: ScoringUsage | null, exa: ExaUsage) {
  const llmUsd = llm?.costUsd ?? 0;
  const totalUsd = llmUsd + exa.costUsd;
  const pricing: EvalPricing = { version: 1, llm, exa, totalUsd };
  return {
    pricing,
    costLlmCents: Math.round(llmUsd * 100),
    costExaCents: Math.round(exa.costUsd * 100),
    costTotalCents: Math.round(totalUsd * 100),
  };
}

export function computeScoringCostUsd(
  model: ScoringModel,
  u: { inputTokens: number; outputTokens: number; cachedInputTokens: number },
): number {
  const p = MODEL_PRICING_USD_PER_1M[model];
  const freshInput = Math.max(0, u.inputTokens - u.cachedInputTokens);
  return (
    (freshInput * p.input) / 1_000_000 +
    (u.cachedInputTokens * p.cachedRead) / 1_000_000 +
    (u.outputTokens * p.output) / 1_000_000
  );
}

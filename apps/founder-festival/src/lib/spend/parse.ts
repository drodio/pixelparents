// Pure response parsers for the live spend sources. Kept free of fetch/db so
// they can be unit-tested directly; the network wrappers (vercel-ai-gateway.ts,
// exa-usage.ts) call these on the JSON they receive.

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

// Vercel AI Gateway GET /v1/credits → { balance, total_used } as USD strings.
export function parseVercelCredits(json: unknown): {
  balanceUsd: number;
  totalUsedUsd: number;
} {
  const o = (json ?? {}) as Record<string, unknown>;
  return { balanceUsd: num(o.balance), totalUsedUsd: num(o.total_used) };
}

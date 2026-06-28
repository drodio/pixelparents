import type { EnricherContext, EnrichmentResult } from "./types";
import { extractCandidateDomains } from "../exa";
import { fetchTrancoRank } from "../tranco";

// Tranco enricher — independent domain-reach cross-check (vs Majestic Million).
// Resolves candidate company domains from the search highlights (same source MM
// uses) and reports the BEST (lowest) Tranco rank found. Identity-safe: it names
// the domain so the scorer can judge relevance, and adds no name-guessing.

function tier(rank: number): string {
  if (rank <= 10_000) return "a top-10k global domain";
  if (rank <= 100_000) return "a top-100k global domain";
  return "a top-1M global domain";
}

export async function enrichWithTranco(ctx: EnricherContext): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "tranco", facts: [], citations: [] };

  const domains = extractCandidateDomains(ctx.searchHighlights).slice(0, 4);
  if (domains.length === 0) return empty;

  let best: { domain: string; rank: number } | null = null;
  for (const d of domains) {
    const rank = await fetchTrancoRank(d);
    if (rank != null && (best === null || rank < best.rank)) best = { domain: d, rank };
  }
  if (!best) return empty;

  return {
    source: "tranco",
    facts: [
      `Tranco: ${best.domain} is ${tier(best.rank)} (rank #${best.rank.toLocaleString("en-US")}) — independent reach corroboration (cross-checks Majestic Million).`,
    ],
    citations: [`https://tranco-list.eu/query?domains=${encodeURIComponent(best.domain)}`],
    raw: { domain: best.domain, rank: best.rank },
  };
}

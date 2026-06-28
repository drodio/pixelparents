// Tranco (https://tranco-list.eu) — a research-grade domain popularity ranking that
// aggregates several top-lists, more manipulation-resistant than any single list. We
// use it as an INDEPENDENT cross-check of Majestic Million for company-domain reach.
// Keyed off a domain we already associate with the subject's company → identity-safe.
//
//   GET /api/ranks/domain/<domain> → { ranks: [{ date, rank }, ...] }  (most recent first)
//
// Lower rank = more popular (rank 1 = most popular site in the world). A domain not on
// the top ~1M list returns no ranks. Read-only, best-effort.

const API = "https://tranco-list.eu/api/ranks/domain";
const UA = "founder-festival-eval/1.0 (https://festival.so)";

// Most recent Tranco rank for a domain, or null if unranked / on error.
export async function fetchTrancoRank(domain: string): Promise<number | null> {
  try {
    const res = await fetch(`${API}/${encodeURIComponent(domain)}`, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { ranks?: Array<{ date: string; rank: number }> };
    const latest = j.ranks?.find((r) => typeof r.rank === "number" && r.rank > 0);
    return latest ? latest.rank : null;
  } catch {
    return null;
  }
}

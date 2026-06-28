import { getExaClient } from "../exa";
import { emptyExaUsage, searchUsage } from "../exa-cost";
import type { EnricherContext, EnrichmentResult } from "./types";

const EXA_DOMAIN_NUM_RESULTS = 6;

// Second-pass Exa search restricted to high-signal domains. Surfaces details
// that the unrestricted first pass might bury (Crunchbase profiles, TechCrunch
// coverage, Forbes lists, YC company pages, etc.).
const HIGH_SIGNAL_DOMAINS = [
  "crunchbase.com",
  "techcrunch.com",
  "forbes.com",
  "businessinsider.com",
  "ycombinator.com",
  "techstars.com",
  "f6s.com",
  "bloomberg.com",
  "venturebeat.com",
  "fortune.com",
  "axios.com",
];

export async function enrichWithExaDomain(ctx: EnricherContext): Promise<EnrichmentResult> {
  // Need at least a name to do a meaningful second pass — without it we'd just
  // re-do the same LinkedIn-URL query. No Exa call here, so usage is zero.
  if (!ctx.fullName) return { source: "exa-domain", facts: [], citations: [], exaUsage: emptyExaUsage() };
  try {
    const exa = getExaClient();
    const result = (await exa.search(
      `${ctx.fullName} founder investor venture capital startup`,
      {
        type: "auto",
        numResults: EXA_DOMAIN_NUM_RESULTS,
        includeDomains: HIGH_SIGNAL_DOMAINS,
        contents: { highlights: true },
      },
    )) as unknown as {
      results?: Array<{ url: string; title?: string; highlights?: string[] }>;
      costDollars?: { total?: number };
    };
    // Real cost Exa charged for this request (request was billed regardless of
    // result count).
    const exaUsage = searchUsage(EXA_DOMAIN_NUM_RESULTS, result.costDollars?.total);

    const results = result.results ?? [];
    if (results.length === 0) return { source: "exa-domain", facts: [], citations: [], exaUsage };

    const facts: string[] = [`High-signal sources mentioning ${ctx.fullName}:`];
    const citations: string[] = [];
    for (const r of results) {
      const title = r.title ?? r.url;
      facts.push(`  • [${shortHost(r.url)}] ${title}`);
      for (const h of (r.highlights ?? []).slice(0, 2)) {
        facts.push(`      "${h.replace(/\s+/g, " ").slice(0, 240)}"`);
      }
      citations.push(r.url);
    }
    return {
      source: "exa-domain",
      facts,
      citations,
      raw: { count: results.length, domains: results.map((r) => shortHost(r.url)) },
      exaUsage,
    };
  } catch (err) {
    // Threw before the request was billed (network/auth) — count nothing.
    return { source: "exa-domain", facts: [], citations: [], raw: { error: String(err) }, exaUsage: emptyExaUsage() };
  }
}

function shortHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

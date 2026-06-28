import type { EnricherContext, EnrichmentResult } from "./types";
import { domainHost, domainHostOrNull } from "@/lib/domain-normalize";
import { extractCompanyNames } from "./extract";

// Y Combinator companies API — public, no token. Their algolia-backed search
// at https://www.ycombinator.com/companies has a JSON endpoint:
//   https://yc-oss.github.io/api/companies/all.json
// (community-maintained dump that mirrors YC's public list).
//
// For speed + reliability we cache the list in module memory once per
// runtime instance. Fluid Compute reuse keeps this hot across requests.

type YCCompany = {
  name: string;
  slug: string;
  url?: string;
  website?: string;
  batch?: string;
  status?: string;
  one_liner?: string;
};

let cachedAt = 0;
let cache: YCCompany[] = [];
let cacheByLowerName: Map<string, YCCompany> = new Map();
let cacheByDomain: Map<string, YCCompany> = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

async function loadYCCompanies(): Promise<YCCompany[]> {
  if (cache.length > 0 && Date.now() - cachedAt < CACHE_TTL_MS) return cache;
  try {
    const res = await fetch("https://yc-oss.github.io/api/companies/all.json", {
      headers: { "user-agent": "founder-festival-eval/1.0" },
    });
    if (!res.ok) return cache;
    const all = (await res.json()) as YCCompany[];
    cache = Array.isArray(all) ? all : [];
    cachedAt = Date.now();
    cacheByLowerName = new Map(cache.map((c) => [c.name.toLowerCase(), c]));
    cacheByDomain = new Map();
    for (const c of cache) {
      const host = domainHostOrNull(c.website ?? c.url);
      if (host) cacheByDomain.set(host, c);
    }
  } catch {
    // Keep whatever stale cache we had on network failure
  }
  return cache;
}

export async function enrichWithYC(ctx: EnricherContext, knownYcUrls: string[]): Promise<EnrichmentResult> {
  await loadYCCompanies();
  if (cache.length === 0) {
    return { source: "yc", facts: [], citations: [], raw: { skipped: "yc list unavailable" } };
  }

  const hits = new Map<string, YCCompany>();

  // 1. If Exa already mentioned a ycombinator.com/companies/<slug> URL, match by slug.
  for (const u of knownYcUrls) {
    const m = u.match(/ycombinator\.com\/companies\/([^?#/]+)/i);
    if (!m) continue;
    const slug = m[1]!.toLowerCase();
    const co = cache.find((c) => c.slug.toLowerCase() === slug);
    if (co) hits.set(co.name, co);
  }

  // 2. Match by company name extracted from the LinkedIn page.
  const candidateNames = extractCompanyNames(ctx.linkedinPageText);
  for (const name of candidateNames) {
    const co = cacheByLowerName.get(name.toLowerCase());
    if (co) hits.set(co.name, co);
  }

  // 3. Match by any domain present in highlights.
  const domainRe = /\b([a-z0-9][a-z0-9-]{0,61}(?:\.[a-z0-9-]{1,63})*\.[a-z]{2,})\b/gi;
  const seenDomains = new Set<string>();
  function harvestDomains(text: string) {
    const matches = text.match(domainRe) ?? [];
    for (const m of matches) {
      seenDomains.add(domainHost(m));
    }
  }
  harvestDomains(ctx.linkedinPageText);
  for (const r of ctx.searchHighlights) {
    harvestDomains(r.url);
    for (const h of r.highlights ?? []) harvestDomains(h);
  }
  for (const d of seenDomains) {
    const co = cacheByDomain.get(d);
    if (co) hits.set(co.name, co);
  }

  if (hits.size === 0) {
    return { source: "yc", facts: [], citations: [] };
  }

  const facts: string[] = [];
  const citations: string[] = [];
  facts.push(`Matched ${hits.size} company name${hits.size === 1 ? "" : "s"} on the official YC list:`);
  for (const co of hits.values()) {
    facts.push(`  • ${co.name}${co.batch ? ` (YC ${co.batch})` : ""}${co.status ? ` — ${co.status}` : ""}${co.one_liner ? `. ${co.one_liner}` : ""}`);
    if (co.url) citations.push(co.url);
  }

  return {
    source: "yc",
    facts,
    citations,
    raw: { matched_company_count: hits.size, matches: [...hits.values()].map((c) => ({ name: c.name, batch: c.batch, slug: c.slug })) },
  };
}

import { describe, it, expect } from "vitest";
import { ENRICHERS, runRegistry, type Enricher, type EnrichCtx } from "@/lib/enrichers";
import type { EnrichmentResult } from "@/lib/enrichers/types";

// P1-1: the enrichment pipeline is now a registry (ENRICHERS: Enricher[]) instead
// of a hard-coded Promise.allSettled array. Adding/removing a source is one entry;
// runRegistry owns the parallel-run + per-source-timeout + aggregation so it can be
// tested without hitting any external API.

const EXPECTED_SOURCES: EnrichmentResult["source"][] = [
  "github", "producthunt", "wikipedia", "yc", "exa-domain", "hackernews",
  "sec-edgar", "stackoverflow", "npm", "huggingface", "wikidata", "openalex", "kaggle",
  "crates", "tranco",
  "nfx", "neo", "devto", "hn-tokenmaxxing", "librariesio", "google-kg", "youtube",
  "brightdata", "crunchbase", "linkedin-company", "crunchbase-person", "patents", "twitter",
];

// Minimal ctx — the fake enrichers below ignore it.
const CTX = { knownUrls: {} } as unknown as EnrichCtx;

function fake(source: EnrichmentResult["source"], run: Enricher["run"], timeoutMs?: number): Enricher {
  return { source, run, timeoutMs };
}
function ok(source: EnrichmentResult["source"], facts: string[]): EnrichmentResult {
  return { source, facts, citations: [] };
}

describe("ENRICHERS registry", () => {
  it("covers exactly the expected source set, with no duplicates", () => {
    const sources = ENRICHERS.map((e) => e.source);
    expect(new Set(sources).size).toBe(sources.length); // no dupes
    expect([...sources].sort()).toEqual([...EXPECTED_SOURCES].sort());
  });

  it("every entry exposes a callable run()", () => {
    for (const e of ENRICHERS) expect(typeof e.run).toBe("function");
  });
});

describe("runRegistry", () => {
  it("collects results that produced facts and drops empty ones", async () => {
    const enrichers = [
      fake("github", async () => ok("github", ["Built X (1.2k★)"])),
      fake("npm", async () => ok("npm", [])), // empty → dropped
      fake("devto", async () => ok("devto", ["Wrote 3 posts"])),
    ];
    const { enrichments } = await runRegistry(enrichers, CTX);
    expect(enrichments.map((e) => e.source).sort()).toEqual(["devto", "github"]);
  });

  it("a throwing enricher can't sink the run (isolated to empty)", async () => {
    const enrichers = [
      fake("github", async () => ok("github", ["ok"])),
      fake("npm", async () => {
        throw new Error("boom");
      }),
    ];
    const { enrichments } = await runRegistry(enrichers, CTX);
    expect(enrichments.map((e) => e.source)).toEqual(["github"]);
  });

  it("honors a per-source timeoutMs (a hung source resolves empty, others proceed)", async () => {
    const enrichers = [
      fake("github", async () => ok("github", ["fast"])),
      fake(
        "sec-edgar",
        () => new Promise<EnrichmentResult>((res) => setTimeout(() => res(ok("sec-edgar", ["slow"])), 200)),
        20, // 20ms budget → times out before the 200ms resolve
      ),
    ];
    const { enrichments } = await runRegistry(enrichers, CTX);
    expect(enrichments.map((e) => e.source)).toEqual(["github"]);
  });
});

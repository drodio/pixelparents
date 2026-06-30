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
  "website",
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
  it("KEEPS every result (including empty) but only fact-producing ones are 'ok'", async () => {
    const enrichers = [
      fake("github", async () => ok("github", ["Built X (1.2k★)"])),
      fake("npm", async () => ok("npm", [])), // empty → kept, status derived no_data
      fake("devto", async () => ok("devto", ["Wrote 3 posts"])),
    ];
    const { enrichments, okEnrichments, statuses } = await runRegistry(enrichers, CTX);
    // The full roster is retained so the UI can show which sources ran.
    expect(enrichments.map((e) => e.source).sort()).toEqual(["devto", "github", "npm"]);
    // Only fact-producing sources feed downstream consumers.
    expect(okEnrichments.map((e) => e.source).sort()).toEqual(["devto", "github"]);
    // The empty npm result derives a "no_data" status.
    const npm = statuses.find((s) => s.source === "npm");
    expect(npm?.status).toBe("no_data");
    expect(npm?.factCount).toBe(0);
  });

  it("surfaces an explicit no_api_key status (visible, intentional skip)", async () => {
    const enrichers = [
      fake("github", async () => ok("github", ["ok"])),
      fake("producthunt", async () => ({
        source: "producthunt" as const,
        status: "no_api_key" as const,
        note: "API key not set",
        facts: [],
        citations: [],
      })),
    ];
    const { enrichments, okEnrichments, statuses } = await runRegistry(enrichers, CTX);
    expect(enrichments.map((e) => e.source).sort()).toEqual(["github", "producthunt"]);
    expect(okEnrichments.map((e) => e.source)).toEqual(["github"]);
    const ph = statuses.find((s) => s.source === "producthunt");
    expect(ph?.status).toBe("no_api_key");
    expect(ph?.note).toBe("API key not set");
  });

  it("a throwing enricher is kept with an 'error' status (can't sink the run)", async () => {
    const enrichers = [
      fake("github", async () => ok("github", ["ok"])),
      fake("npm", async () => {
        throw new Error("boom");
      }),
    ];
    const { enrichments, okEnrichments, statuses } = await runRegistry(enrichers, CTX);
    expect(enrichments.map((e) => e.source).sort()).toEqual(["github", "npm"]);
    expect(okEnrichments.map((e) => e.source)).toEqual(["github"]);
    expect(statuses.find((s) => s.source === "npm")?.status).toBe("error");
  });

  it("honors a per-source timeoutMs (a hung source is kept as 'error', others proceed)", async () => {
    const enrichers = [
      fake("github", async () => ok("github", ["fast"])),
      fake(
        "sec-edgar",
        () => new Promise<EnrichmentResult>((res) => setTimeout(() => res(ok("sec-edgar", ["slow"])), 200)),
        20, // 20ms budget → times out before the 200ms resolve
      ),
    ];
    const { okEnrichments, statuses } = await runRegistry(enrichers, CTX);
    expect(okEnrichments.map((e) => e.source)).toEqual(["github"]);
    expect(statuses.find((s) => s.source === "sec-edgar")?.status).toBe("error");
  });
});

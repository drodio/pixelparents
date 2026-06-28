import { describe, it, expect } from "vitest";
import { withEnricherTimeout } from "@/lib/enrichers";
import type { EnrichmentResult } from "@/lib/enrichers/types";

// P1-2 (pipeline reliability): enrichers run in parallel via Promise.allSettled,
// which waits for the SLOWEST member — so a single hung external API (only neo
// had its own timeout) dragged the whole eval to the 300s maxDuration kill.
// withEnricherTimeout caps each enricher: on deadline it resolves to an empty
// result (facts:[]), which the orchestrator's "facts.length > 0" filter ignores,
// so the eval proceeds with whatever completed in time.

const real: EnrichmentResult = {
  source: "github",
  facts: ["Built X (1.2k stars)"],
  citations: ["https://github.com/x"],
};

describe("withEnricherTimeout", () => {
  it("passes through the real result when it resolves before the deadline", async () => {
    const r = await withEnricherTimeout("github", Promise.resolve(real), 100);
    expect(r).toEqual(real);
  });

  it("resolves to an empty result when the enricher exceeds the deadline", async () => {
    const slow = new Promise<EnrichmentResult>((res) => setTimeout(() => res(real), 200));
    const r = await withEnricherTimeout("sec-edgar", slow, 20);
    expect(r).toEqual({ source: "sec-edgar", facts: [], citations: [] });
  });

  it("swallows a rejection into an empty result (never throws)", async () => {
    const r = await withEnricherTimeout("npm", Promise.reject(new Error("boom")), 100);
    expect(r).toEqual({ source: "npm", facts: [], citations: [] });
  });
});

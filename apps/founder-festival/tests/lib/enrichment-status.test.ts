import { describe, it, expect } from "vitest";
import { deriveStatus, toStatusEntry, type EnrichmentResult } from "@/lib/enrichers/types";
import { statusEntriesFromProfile } from "@/components/EnrichmentSourcesSection";

describe("deriveStatus / toStatusEntry", () => {
  it("derives ok when facts present, no_data when empty", () => {
    expect(deriveStatus({ status: undefined, facts: ["a"] })).toBe("ok");
    expect(deriveStatus({ status: undefined, facts: [] })).toBe("no_data");
  });

  it("honors an explicit status over derivation", () => {
    expect(deriveStatus({ status: "no_api_key", facts: [] })).toBe("no_api_key");
    expect(deriveStatus({ status: "error", facts: [] })).toBe("error");
    // Explicit status wins even when facts exist (shouldn't happen, but defined).
    expect(deriveStatus({ status: "no_data", facts: ["a"] })).toBe("no_data");
  });

  it("toStatusEntry builds the compact persistable entry", () => {
    const r: EnrichmentResult = {
      source: "producthunt",
      status: "no_api_key",
      note: "API key not set",
      facts: [],
      citations: [],
    };
    expect(toStatusEntry(r)).toEqual({
      source: "producthunt",
      status: "no_api_key",
      note: "API key not set",
      factCount: 0,
    });
  });
});

describe("statusEntriesFromProfile", () => {
  it("reads enrichmentStatuses when present", () => {
    const profile = {
      enrichmentStatuses: [
        { source: "github", status: "ok", note: null, factCount: 8 },
        { source: "producthunt", status: "no_api_key", note: "API key not set", factCount: 0 },
        { source: "patents", status: "no_data", note: null, factCount: 0 },
      ],
    };
    const entries = statusEntriesFromProfile(profile);
    expect(entries).toHaveLength(3);
    expect(entries.find((e) => e.source === "github")).toMatchObject({ status: "ok", factCount: 8 });
    expect(entries.find((e) => e.source === "producthunt")).toMatchObject({
      status: "no_api_key",
      note: "API key not set",
    });
  });

  it("falls back to deriving from enrichments[] for legacy rows", () => {
    const profile = {
      enrichments: [
        { source: "github", fact_count: 5 },
        { source: "npm", fact_count: 0 },
      ],
    };
    const entries = statusEntriesFromProfile(profile);
    expect(entries.find((e) => e.source === "github")).toMatchObject({ status: "ok", factCount: 5 });
    expect(entries.find((e) => e.source === "npm")).toMatchObject({ status: "no_data", factCount: 0 });
  });

  it("returns [] for missing / malformed profiles", () => {
    expect(statusEntriesFromProfile(null)).toEqual([]);
    expect(statusEntriesFromProfile({})).toEqual([]);
    expect(statusEntriesFromProfile("nope")).toEqual([]);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  linkedinHandleFor,
  cleanStageLabel,
  dedupeCaseInsensitive,
  parseCheckSize,
  enrichWithNeo,
} from "@/lib/enrichers/neo";

describe("linkedinHandleFor", () => {
  it("extracts the handle from canonical URLs", () => {
    expect(linkedinHandleFor("https://www.linkedin.com/in/danacole/")).toBe("danacole");
    expect(linkedinHandleFor("https://linkedin.com/in/drodio")).toBe("drodio");
  });
  it("is case-insensitive", () => {
    expect(linkedinHandleFor("HTTPS://WWW.LINKEDIN.COM/IN/Dana-Cole/")).toBe("dana-cole");
  });
  it("ignores trailing slashes + query params", () => {
    expect(linkedinHandleFor("https://linkedin.com/in/danacole/?utm=foo")).toBe("danacole");
  });
  it("returns null for non-LinkedIn URLs", () => {
    expect(linkedinHandleFor("https://twitter.com/danacole")).toBeNull();
    expect(linkedinHandleFor(null)).toBeNull();
    expect(linkedinHandleFor(undefined)).toBeNull();
  });
});

describe("cleanStageLabel", () => {
  it("strips Neo's parenthetical team-size suffix", () => {
    expect(cleanStageLabel("Pre-seed (1-10 ppl)")).toBe("Pre-seed");
    expect(cleanStageLabel("Series B (50-100 ppl)")).toBe("Series B");
  });
  it("is a no-op for stages without parens", () => {
    expect(cleanStageLabel("Seed")).toBe("Seed");
  });
});

describe("dedupeCaseInsensitive", () => {
  it("keeps first casing, drops later case-variants", () => {
    expect(dedupeCaseInsensitive(["SaaS", "saas", "Fintech"])).toEqual(["SaaS", "Fintech"]);
  });
  it("ignores null + empty strings", () => {
    expect(dedupeCaseInsensitive([null, "", undefined, "AI", "  "])).toEqual(["AI"]);
  });
});

describe("parseCheckSize", () => {
  it("parses a $K-$M range", () => {
    expect(parseCheckSize("$500K - $2M")).toEqual({ minUsd: 500_000, maxUsd: 2_000_000, rawText: "$500K - $2M" });
  });
  it("handles em/en dashes", () => {
    expect(parseCheckSize("$25k–$100k")?.minUsd).toBe(25_000);
    expect(parseCheckSize("$1M—$5M")?.maxUsd).toBe(5_000_000);
  });
  it("parses a single value as min==max", () => {
    expect(parseCheckSize("$1M")).toMatchObject({ minUsd: 1_000_000, maxUsd: 1_000_000 });
  });
  it("returns rawText with no numbers when unparseable", () => {
    expect(parseCheckSize("varies")).toEqual({ rawText: "varies" });
  });
  it("returns null for null/empty input", () => {
    expect(parseCheckSize(null)).toBeNull();
    expect(parseCheckSize("   ")).toBeNull();
  });
});

// ---------------------------------------------------------------- enrichWithNeo
//
// Mock the global fetch so we can assert the enricher hits Bubble correctly,
// post-filters on exact handle, and projects the structured fields.

const NEO_PERSON = {
  _id: "person-1",
  User: "user-1",
  "Social LinkedIn": "https://www.linkedin.com/in/danacole/",
  invCheckSize: null,
  isAccredited: true,
  invStartups: null,
};
const NEO_USER = {
  _id: "user-1",
  Slug: "02-dana-cole",
  "Profile First Name": "Dana",
  "Profile Last Name": "Cole",
  "Profile Org": "Neo",
  "Profile Title": "Partner",
  "Public Title mod": "Neo Partner / 3x founder / Stripe / Twitter",
  Region: "San Francisco",
  ApplyStages: ["Pre-seed (1-10 ppl)", "Seed (10-20 ppl)", "Series B (50-100 ppl)"],
  ApplyIndustries: [],
  invLeadsDeals: true,
  isVC: true,
  numEndorsements: 21,
};

function mockBubble(responses: Record<string, unknown>) {
  // Match by URL substring so the spy is order-independent.
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    for (const [needle, body] of Object.entries(responses)) {
      if (url.includes(needle)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response(JSON.stringify({ response: { results: [] } }), { status: 200 });
  });
}

const ctx = {
  linkedinUrl: "https://linkedin.com/in/danacole",
  linkedinHandle: "danacole",
  linkedinPageText: "",
  searchHighlights: [],
  fullName: "Dana Cole",
};

describe("enrichWithNeo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the structured Neo record + facts when the person + user resolve", async () => {
    mockBubble({
      "obj/person": { response: { results: [NEO_PERSON] } },
      "obj/user": { response: { results: [NEO_USER] } },
    });
    const r = await enrichWithNeo(ctx);
    expect(r.source).toBe("neo");
    expect(r.facts.length).toBeGreaterThan(2);
    expect(r.facts[0]).toMatch(/Listed on Neo as Dana Cole \(Partner at Neo\)/);
    expect(r.facts.some((f) => f.toLowerCase().includes("leads rounds"))).toBe(true);
    expect(r.facts.some((f) => f.includes("Pre-seed, Seed, Series B"))).toBe(true);
    expect(r.facts.some((f) => f.includes("21 endorsements"))).toBe(true);
    expect(r.citations).toEqual(["https://neo.com/investor/02-dana-cole"]);
    const raw = r.raw as { slug: string; stages: string[]; leadsRounds: boolean };
    expect(raw.slug).toBe("02-dana-cole");
    expect(raw.stages).toEqual(["Pre-seed", "Seed", "Series B"]);
    expect(raw.leadsRounds).toBe(true);
  });

  it("returns empty when Neo has no person record for the LinkedIn URL", async () => {
    mockBubble({ "obj/person": { response: { results: [] } } });
    const r = await enrichWithNeo(ctx);
    expect(r.facts).toEqual([]);
    expect(r.raw).toBeUndefined();
  });

  it("post-filters to reject `/in/handlelong` false positives", async () => {
    const decoy = { ...NEO_PERSON, "Social LinkedIn": "https://www.linkedin.com/in/danacolelong/" };
    mockBubble({
      "obj/person": { response: { results: [decoy] } },
      "obj/user": { response: { results: [NEO_USER] } },
    });
    const r = await enrichWithNeo(ctx);
    expect(r.facts).toEqual([]);
  });

  it("returns empty when the matched user is not flagged isVC", async () => {
    mockBubble({
      "obj/person": { response: { results: [NEO_PERSON] } },
      "obj/user": { response: { results: [{ ...NEO_USER, isVC: false }] } },
    });
    const r = await enrichWithNeo(ctx);
    expect(r.facts).toEqual([]);
  });

  it("returns empty on a non-2xx without throwing", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 503 }));
    const r = await enrichWithNeo(ctx);
    expect(r.facts).toEqual([]);
  });

  it("returns empty on a network error without throwing", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await enrichWithNeo(ctx);
    expect(r.facts).toEqual([]);
  });

  it("skips when the subject has no LinkedIn URL", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const r = await enrichWithNeo({ ...ctx, linkedinUrl: "" });
    expect(r.facts).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

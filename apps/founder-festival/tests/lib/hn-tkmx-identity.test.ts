import { describe, it, expect } from "vitest";
import { handleNameTokens, looseNameMatch } from "@/lib/enrichers/hackernews";
import { nameTokens } from "@/lib/enrichers/identity";

describe("handleNameTokens", () => {
  it("splits underscores, digits, and camelCase into name tokens", () => {
    expect(handleNameTokens("Theo_Vance")).toEqual(["theo", "vance"]);
    // No lowercase→uppercase boundary, so this stays one token (DROdio matches
    // by exact handle, not name tokens).
    expect(handleNameTokens("DROdio")).toEqual(["drodio"]);
    expect(handleNameTokens("janeDoe")).toEqual(["jane", "doe"]); // camelCase splits
    expect(handleNameTokens("samrowe")).toEqual(["samrowe"]);
  });
});

describe("looseNameMatch (prefix-tolerant first name, exact last name)", () => {
  it("matches Theodore Vance ↔ Theo_Vance", () => {
    expect(looseNameMatch(nameTokens("Theodore Vance"), handleNameTokens("Theo_Vance"))).toBe(true);
  });
  it("does NOT match a different last name (Theo Brightwood ↔ Theo_Vance)", () => {
    expect(looseNameMatch(nameTokens("Theo Brightwood"), handleNameTokens("Theo_Vance"))).toBe(false);
  });
  it("does NOT match when the first names are unrelated (Marcus Vance ↔ Theo_Vance)", () => {
    expect(looseNameMatch(nameTokens("Marcus Vance"), handleNameTokens("Theo_Vance"))).toBe(false);
  });
  it("requires both names (single-token handles never match)", () => {
    expect(looseNameMatch(nameTokens("Theodore Vance"), handleNameTokens("vance"))).toBe(false);
  });
});

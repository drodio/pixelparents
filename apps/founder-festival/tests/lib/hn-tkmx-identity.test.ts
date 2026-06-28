import { describe, it, expect } from "vitest";
import { handleNameTokens, looseNameMatch } from "@/lib/enrichers/hackernews";
import { nameTokens } from "@/lib/enrichers/identity";

describe("handleNameTokens", () => {
  it("splits underscores, digits, and camelCase into name tokens", () => {
    expect(handleNameTokens("Sam_Odio")).toEqual(["sam", "odio"]);
    // No lowercase→uppercase boundary, so this stays one token (DROdio matches
    // by exact handle, not name tokens).
    expect(handleNameTokens("DROdio")).toEqual(["drodio"]);
    expect(handleNameTokens("janeDoe")).toEqual(["jane", "doe"]); // camelCase splits
    expect(handleNameTokens("mitchellh")).toEqual(["mitchellh"]);
  });
});

describe("looseNameMatch (prefix-tolerant first name, exact last name)", () => {
  it("matches Samuel Odio ↔ Sam_Odio", () => {
    expect(looseNameMatch(nameTokens("Samuel Odio"), handleNameTokens("Sam_Odio"))).toBe(true);
  });
  it("does NOT match a different last name (Sam Altman ↔ Sam_Odio)", () => {
    expect(looseNameMatch(nameTokens("Sam Altman"), handleNameTokens("Sam_Odio"))).toBe(false);
  });
  it("does NOT match when the first names are unrelated (Bob Odio ↔ Sam_Odio)", () => {
    expect(looseNameMatch(nameTokens("Bob Odio"), handleNameTokens("Sam_Odio"))).toBe(false);
  });
  it("requires both names (single-token handles never match)", () => {
    expect(looseNameMatch(nameTokens("Samuel Odio"), handleNameTokens("odio"))).toBe(false);
  });
});

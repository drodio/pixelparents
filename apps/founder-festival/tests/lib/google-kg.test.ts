import { describe, it, expect } from "vitest";
import { kgNameOverlap, kgCorroborated } from "@/lib/enrichers/google-kg";

describe("kgNameOverlap", () => {
  it("requires both first + last for multi-word names", () => {
    expect(kgNameOverlap("Jensen Huang", "Jensen Huang")).toBe(true);
    expect(kgNameOverlap("Jensen Huang", "Jensen Button")).toBe(false); // only first matches
    expect(kgNameOverlap("Jensen Huang", "Huang Renxun")).toBe(false);
  });
  it("handles single-token names + null", () => {
    expect(kgNameOverlap("Madonna", "Madonna")).toBe(true);
    expect(kgNameOverlap(null, "Anyone")).toBe(false);
  });
});

describe("kgCorroborated", () => {
  const subjectTokens = new Set(["nvidia", "stanford"]);
  it("accepts a tech/business description (Jensen's real KG desc)", () => {
    expect(kgCorroborated("President and CEO of NVIDIA", subjectTokens)).toBe(true);
    expect(kgCorroborated("American entrepreneur", new Set())).toBe(true);
  });
  it("accepts when the description mentions a subject token (company match)", () => {
    expect(kgCorroborated("Computer person at NVIDIA", subjectTokens)).toBe(true);
  });
  it("REJECTS a same-named non-business person (no biz terms, no token match)", () => {
    expect(kgCorroborated("American film actor and director", subjectTokens)).toBe(false);
    expect(kgCorroborated("Olympic swimmer", subjectTokens)).toBe(false);
    expect(kgCorroborated("", subjectTokens)).toBe(false);
  });
});

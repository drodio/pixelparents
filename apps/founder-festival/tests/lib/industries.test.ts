import { describe, it, expect } from "vitest";
import {
  normalizeIndustry,
  canonicalizeIndustries,
  industryLabel,
  INDUSTRY_SLUGS,
  INDUSTRY_LABELS,
} from "@/lib/industries";

describe("normalizeIndustry", () => {
  it("maps free-text variants to one canonical slug", () => {
    for (const t of ["Fintech", "fintech", "FinTech", "financial services", "Payments", "B2B Fintech"]) {
      expect(normalizeIndustry(t)).toBe("fintech");
    }
    for (const t of ["AI", "Artificial Intelligence", "machine learning", "LLMs", "GenAI", "applied ai"]) {
      expect(normalizeIndustry(t)).toBe("ai-ml");
    }
    expect(normalizeIndustry("Digital Health")).toBe("healthcare");
    expect(normalizeIndustry("web3")).toBe("crypto");
    expect(normalizeIndustry("Climate Tech")).toBe("climate");
  });

  it("strips trailing role words like 'Focus'", () => {
    expect(normalizeIndustry("Fintech Focus")).toBe("fintech");
    expect(normalizeIndustry("Healthcare investing")).toBe("healthcare");
  });

  it("returns null for unknown / empty text (no invented bucket)", () => {
    expect(normalizeIndustry("Underwater Basket Weaving")).toBeNull();
    expect(normalizeIndustry("")).toBeNull();
    expect(normalizeIndustry(null)).toBeNull();
  });
});

describe("canonicalizeIndustries", () => {
  it("normalizes + dedupes, preserving first-seen order", () => {
    expect(
      canonicalizeIndustries(["FinTech", "payments", "AI", "machine learning", "nonsense", "Healthcare"]),
    ).toEqual(["fintech", "ai-ml", "healthcare"]);
  });
  it("returns [] for all-unknown input", () => {
    expect(canonicalizeIndustries(["xyz", null, ""])).toEqual([]);
  });
});

describe("taxonomy invariants", () => {
  it("every slug has a label, and industryLabel round-trips", () => {
    for (const slug of INDUSTRY_SLUGS) {
      expect(INDUSTRY_LABELS[slug]).toBeTruthy();
      expect(industryLabel(slug)).toBe(INDUSTRY_LABELS[slug]);
    }
    expect(industryLabel("not-a-slug")).toBeNull();
  });
});

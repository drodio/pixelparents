import { describe, it, expect } from "vitest";
import {
  infoToScoringResult,
  extractFirstJsonObject,
  emptyInfoScoringResult,
} from "@/lib/connect-info";

// The connect-mode info-extraction pass maps a small Claude "info profile" onto
// a full ScoringResult shape with EVERY scoring field zeroed — so the existing
// persistence (payloadToWriteFields) writes score=0 / empty breakdowns / null
// statuses while keeping identity + recommendations + industries intact.

describe("extractFirstJsonObject", () => {
  it("parses a bare JSON object", () => {
    expect(extractFirstJsonObject('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips markdown fences and leading prose", () => {
    const text = 'Here you go:\n```json\n{"a": 2, "b": "x"}\n```\nthanks';
    expect(extractFirstJsonObject(text)).toEqual({ a: 2, b: "x" });
  });
  it("finds the first balanced object even with braces in strings", () => {
    expect(extractFirstJsonObject('{"s":"a{b}c"} trailing')).toEqual({ s: "a{b}c" });
  });
  it("throws when there is no object", () => {
    expect(() => extractFirstJsonObject("no json here")).toThrow();
  });
});

describe("infoToScoringResult — score zeroing", () => {
  const full = infoToScoringResult({
    fullName: "Jane Rivera",
    headline: "Pediatric nurse and OHS parent",
    currentRole: "RN",
    currentCompany: "Lucile Packard Children's Hospital",
    primaryCompanyDomain: "stanfordchildrens.org",
    publicEmail: null,
    githubUsername: null,
    location: { city: "Palo Alto", region: "CA", country: "USA" },
    education: [{ institution: "UCSF", degree: "BSN" }],
    bio: "Jane is a pediatric nurse and an active OHS parent who mentors students interested in healthcare careers.",
    expertiseTags: ["healthcare", "nursing", "mentorship"],
    howTheyCanHelp: [
      { text: "Can advise students exploring nursing and pre-health paths", category: "mentorship" },
      { text: "Happy to introduce families to local healthcare volunteering", category: "intros" },
    ],
  });

  it("zeroes ALL score fields", () => {
    expect(full.founderScore).toBe(0);
    expect(full.investorScore).toBe(0);
    expect(full.combinedScore).toBe(0);
    expect(full.founderBreakdown).toEqual([]);
    expect(full.investorBreakdown).toEqual([]);
  });

  it("leaves founder/investor status null (no competitive markers)", () => {
    expect(full.founderStatus).toBeNull();
    expect(full.investorStatus).toBeNull();
  });

  it("carries identity through (name, role, company, location, education)", () => {
    expect(full.fullName).toBe("Jane Rivera");
    expect(full.identity.companyName).toBe("Lucile Packard Children's Hospital");
    expect(full.identity.jobTitle).toBe("RN");
    expect(full.identity.headline).toBe("Pediatric nurse and OHS parent");
    expect(full.identity.location).toEqual({ city: "Palo Alto", region: "CA", country: "USA" });
    expect(full.identity.education).toEqual([{ institution: "UCSF", degree: "BSN" }]);
  });

  it("rides expertise tags on `industries` (rendered as plain tags, no points)", () => {
    expect(full.industries).toEqual(["healthcare", "nursing", "mentorship"]);
  });

  it("puts the neutral bio in the credibilityTitle slot", () => {
    expect(full.credibilityTitle).toContain("pediatric nurse");
  });

  it("maps 'how they can help' into recommendations.items (reframed as the person's offer)", () => {
    expect(full.recommendations.items).toHaveLength(2);
    expect(full.recommendations.items[0]!.text).toContain("nursing");
    // category is mapped onto the existing recommendations enum (schema stability)
    expect(["fundraising", "hiring", "intros", "tactical", "positioning", "wellbeing"]).toContain(
      full.recommendations.items[0]!.category,
    );
    expect(full.recommendations.items[1]!.category).toBe("intros");
  });
});

describe("infoToScoringResult — tolerant of garbage / empty", () => {
  it("an empty object yields a valid, fully-zeroed result", () => {
    const empty = emptyInfoScoringResult();
    expect(empty.founderScore).toBe(0);
    expect(empty.investorScore).toBe(0);
    expect(empty.combinedScore).toBe(0);
    expect(empty.fullName).toBeNull();
    expect(empty.industries).toEqual([]);
    expect(empty.recommendations.items).toEqual([]);
    expect(empty.founderStatus).toBeNull();
  });

  it("drops malformed expertise tags + education + help items without throwing", () => {
    const r = infoToScoringResult({
      fullName: 42, // wrong type → null
      expertiseTags: ["ok", "", 7, null, "  spaced  "],
      education: [{ institution: "MIT", degree: null }, { degree: "no-institution" }, "junk"],
      howTheyCanHelp: [{ text: "" }, { text: "valid offer", category: "bogus" }, "junk"],
    });
    expect(r.fullName).toBeNull();
    expect(r.industries).toEqual(["ok", "spaced"]);
    expect(r.identity.education).toEqual([{ institution: "MIT", degree: null }]);
    expect(r.recommendations.items).toHaveLength(1);
    expect(r.recommendations.items[0]!.text).toBe("valid offer");
    // unknown help category falls back to a safe mapped value
    expect(r.recommendations.items[0]!.category).toBe("tactical");
  });
});

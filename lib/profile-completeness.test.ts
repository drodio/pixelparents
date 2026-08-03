import { describe, it, expect } from "vitest";
import { profileGaps, isProfileComplete } from "./profile-completeness";
import type { SignupRow } from "@/lib/db/schema/signups";

// Minimal row factory — only the fields profileGaps reads.
function row(over: Partial<SignupRow> = {}): SignupRow {
  return {
    parentInterests: ["Biking"],
    country: "United States",
    city: "Palo Alto",
    ohsAffiliation: "Existing parent (child(ren) currently enrolled at OHS)",
    extra: { builderInterest: "builder" },
    ...over,
  } as unknown as SignupRow;
}

describe("profileGaps", () => {
  it("reports nothing for a fully filled parent", () => {
    expect(profileGaps(row())).toEqual([]);
    expect(isProfileComplete(row())).toBe(true);
  });

  it("flags missing interests — the field community matching depends on", () => {
    expect(profileGaps(row({ parentInterests: [] })).map((g) => g.key)).toEqual(["interests"]);
    expect(profileGaps(row({ parentInterests: null })).map((g) => g.key)).toEqual(["interests"]);
  });

  it("accepts country OR city as location — never demands both", () => {
    expect(profileGaps(row({ city: null })).map((g) => g.key)).toEqual([]);
    expect(profileGaps(row({ country: null })).map((g) => g.key)).toEqual([]);
    expect(
      profileGaps(row({ country: null, city: null })).map((g) => g.key),
    ).toEqual(["location"]);
  });

  it("flags a parent with no affiliation", () => {
    expect(profileGaps(row({ ohsAffiliation: null })).map((g) => g.key)).toEqual(["affiliation"]);
  });

  it("never nudges a student or alum about affiliation — it's derived, not askable", () => {
    const student = row({ ohsAffiliation: null, extra: { accountType: "student", builderInterest: "no" } });
    const alum = row({ ohsAffiliation: null, extra: { accountType: "alum", builderInterest: "no" } });
    expect(profileGaps(student).map((g) => g.key)).toEqual([]);
    expect(profileGaps(alum).map((g) => g.key)).toEqual([]);
  });

  it("reports every gap for a brand-new minimal account", () => {
    const fresh = row({ parentInterests: [], country: null, city: null, ohsAffiliation: null, extra: {} });
    expect(profileGaps(fresh).map((g) => g.key)).toEqual([
      "interests",
      "location",
      "affiliation",
      "builder",
    ]);
    expect(isProfileComplete(fresh)).toBe(false);
  });

  it("is safe on a null row", () => {
    expect(profileGaps(null)).toEqual([]);
    expect(isProfileComplete(null)).toBe(true);
  });

  // Regression: builderInterest was a REQUIRED signup question that
  // completeSignup hard-rejected. When the question was removed from the form,
  // every new signup failed with an error naming a field that wasn't on the
  // page. It's a profile gap now, never a submission blocker.
  it("treats a missing/blank builder answer as a gap, not a blocker", () => {
    expect(profileGaps(row({ extra: {} })).map((g) => g.key)).toEqual(["builder"]);
    expect(profileGaps(row({ extra: { builderInterest: "" } })).map((g) => g.key)).toEqual([
      "builder",
    ]);
    for (const ans of ["builder", "aspiring", "no"]) {
      expect(profileGaps(row({ extra: { builderInterest: ans } }))).toEqual([]);
    }
  });
});

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
    extra: {},
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
    const student = row({ ohsAffiliation: null, extra: { accountType: "student" } });
    const alum = row({ ohsAffiliation: null, extra: { accountType: "alum" } });
    expect(profileGaps(student).map((g) => g.key)).toEqual([]);
    expect(profileGaps(alum).map((g) => g.key)).toEqual([]);
  });

  it("reports every gap for a brand-new minimal account", () => {
    const fresh = row({ parentInterests: [], country: null, city: null, ohsAffiliation: null });
    expect(profileGaps(fresh).map((g) => g.key)).toEqual([
      "interests",
      "location",
      "affiliation",
    ]);
    expect(isProfileComplete(fresh)).toBe(false);
  });

  it("is safe on a null row", () => {
    expect(profileGaps(null)).toEqual([]);
    expect(isProfileComplete(null)).toBe(true);
  });
});

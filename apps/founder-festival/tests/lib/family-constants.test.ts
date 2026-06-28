import { describe, it, expect } from "vitest";
import {
  computeAge,
  isRelationship,
  isVisibility,
  relationshipLabel,
} from "@/lib/family-constants";

describe("family-constants", () => {
  it("validates relationship + visibility values", () => {
    expect(isRelationship("daughter")).toBe(true);
    expect(isRelationship("other")).toBe(true);
    expect(isRelationship("cousin")).toBe(false);
    expect(isVisibility("all_claimed")).toBe(true);
    expect(isVisibility("specific")).toBe(true);
    expect(isVisibility("public")).toBe(false);
  });

  it("labels relationships, with the free-text override winning for 'other'", () => {
    expect(relationshipLabel("daughter")).toBe("Daughter");
    expect(relationshipLabel("family-member")).toBe("Family Member");
    expect(relationshipLabel("other", "Godparent")).toBe("Godparent");
    expect(relationshipLabel("other", "  ")).toBe("Other"); // blank override → generic label
  });

  it("computes age from a birthdate and handles missing/garbage", () => {
    expect(computeAge(null)).toBeNull();
    expect(computeAge("not-a-date")).toBeNull();
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    tenYearsAgo.setDate(tenYearsAgo.getDate() - 1); // ensure the birthday has passed
    const iso = tenYearsAgo.toISOString().slice(0, 10);
    expect(computeAge(iso)).toBe(10);
    // A birthday later this year → still the younger age.
    const almost = new Date();
    almost.setFullYear(almost.getFullYear() - 5);
    almost.setDate(almost.getDate() + 2); // birthday is 2 days away
    expect(computeAge(almost.toISOString().slice(0, 10))).toBe(4);
  });
});

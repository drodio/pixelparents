import { describe, it, expect } from "vitest";
import {
  OHS_AFFILIATIONS,
  PARENT_AFFILIATIONS,
  STUDENT_AFFILIATION,
  ALUM_AFFILIATION,
  affiliationForRole,
} from "./options";

// Students and alums are no longer asked "Stanford OHS affiliation" — the answer
// is implied by the role they already picked in "Who's signing up?", and asking
// twice was duplicated signup friction (parent feedback, Jul 2026). These tests
// pin the derivation so the hidden field can never silently go unpopulated,
// which would fail completeSignup's required-field validation.
describe("affiliation derivation", () => {
  it("splits the canonical list into parent-only options", () => {
    expect(PARENT_AFFILIATIONS).toHaveLength(3);
    for (const a of PARENT_AFFILIATIONS) expect(a).toContain("parent");
    // Sliced from the canonical list, never retyped.
    for (const a of PARENT_AFFILIATIONS) expect(OHS_AFFILIATIONS).toContain(a);
  });

  it("keeps the student + alum options out of the parent picker", () => {
    expect(PARENT_AFFILIATIONS).not.toContain(STUDENT_AFFILIATION);
    expect(PARENT_AFFILIATIONS).not.toContain(ALUM_AFFILIATION);
  });

  it("derives a real, canonical affiliation for student and alum", () => {
    expect(affiliationForRole("student")).toBe(STUDENT_AFFILIATION);
    expect(affiliationForRole("alum")).toBe(ALUM_AFFILIATION);
    // Must be a member of the enum completeSignup validates against, or the
    // hidden field would fail validation the user can no longer see or fix.
    expect(OHS_AFFILIATIONS).toContain(affiliationForRole("student"));
    expect(OHS_AFFILIATIONS).toContain(affiliationForRole("alum"));
  });

  it("returns empty for a parent so the form still asks them", () => {
    expect(affiliationForRole("parent")).toBe("");
  });

  it("covers every role with no overlap between derived and asked", () => {
    const derived = [affiliationForRole("student"), affiliationForRole("alum")];
    expect(new Set([...derived, ...PARENT_AFFILIATIONS]).size).toBe(
      OHS_AFFILIATIONS.length,
    );
  });
});

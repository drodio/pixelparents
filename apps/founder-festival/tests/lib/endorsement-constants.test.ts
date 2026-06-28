import { describe, it, expect } from "vitest";
import {
  allowedPointsVisibilities,
  clampPointsVisibility,
  canViewAtVisibility,
  ENDORSE_PLACEHOLDER,
  isVisibility,
} from "@/lib/endorsement-constants";

describe("endorsement visibility", () => {
  it("constrains points visibility to ≤ endorsement visibility", () => {
    expect(allowedPointsVisibilities("public")).toEqual(["public", "members_only", "private"]);
    expect(allowedPointsVisibilities("members_only")).toEqual(["members_only", "private"]);
    expect(allowedPointsVisibilities("private")).toEqual(["private"]);
  });

  it("clamps a too-visible points choice down to the endorsement level", () => {
    expect(clampPointsVisibility("public", "members_only")).toBe("members_only");
    expect(clampPointsVisibility("private", "members_only")).toBe("private");
    expect(clampPointsVisibility("members_only", "public")).toBe("members_only");
  });

  it("gates who can view a given visibility", () => {
    expect(canViewAtVisibility("public", { isMember: false, isAuthor: false })).toBe(true);
    expect(canViewAtVisibility("members_only", { isMember: false, isAuthor: false })).toBe(false);
    expect(canViewAtVisibility("members_only", { isMember: true, isAuthor: false })).toBe(true);
    expect(canViewAtVisibility("private", { isMember: true, isAuthor: false })).toBe(false);
    expect(canViewAtVisibility("private", { isMember: false, isAuthor: true })).toBe(true);
  });

  it("validates visibility values", () => {
    expect(isVisibility("public")).toBe(true);
    expect(isVisibility("members_only")).toBe(true);
    expect(isVisibility("nope")).toBe(false);
  });

  it("builds the placeholder with the first name", () => {
    expect(ENDORSE_PLACEHOLDER("Jonah")).toContain("Write an endorsement for Jonah");
    expect(ENDORSE_PLACEHOLDER("Jonah")).toContain("@mention");
  });
});

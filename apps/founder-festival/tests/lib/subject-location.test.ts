import { describe, it, expect } from "vitest";
import {
  parseLocationDisplayName,
  shouldOverwriteLocation,
  LOCATION_RANK,
} from "@/lib/subject-location";

describe("parseLocationDisplayName", () => {
  it("splits 3-part 'City, Region, Country'", () => {
    expect(parseLocationDisplayName("San Francisco, California, United States")).toEqual({
      city: "San Francisco", region: "California", country: "United States",
      raw: "San Francisco, California, United States",
    });
  });
  it("treats 2-part as city + country", () => {
    expect(parseLocationDisplayName("London, United Kingdom")).toEqual({
      city: "London", region: null, country: "United Kingdom", raw: "London, United Kingdom",
    });
  });
  it("keeps a 1-part value as raw only (unstructured)", () => {
    expect(parseLocationDisplayName("San Francisco Bay Area")).toEqual({
      city: null, region: null, country: null, raw: "San Francisco Bay Area",
    });
  });
  it("returns all-null for empty/whitespace", () => {
    expect(parseLocationDisplayName("  ")).toEqual({ city: null, region: null, country: null, raw: null });
    expect(parseLocationDisplayName(null)).toEqual({ city: null, region: null, country: null, raw: null });
  });
  it("uses the LAST part as country for 4+ parts", () => {
    const r = parseLocationDisplayName("Brooklyn, NYC, New York, USA");
    expect(r.city).toBe("Brooklyn");
    expect(r.country).toBe("USA");
  });
});

describe("shouldOverwriteLocation (precedence claimer > operator > linkedin)", () => {
  it("writes when nothing is stored", () => {
    expect(shouldOverwriteLocation(null, "linkedin")).toBe(true);
    expect(shouldOverwriteLocation(null, "claimer")).toBe(true);
  });
  it("operator overwrites linkedin; linkedin does NOT overwrite operator", () => {
    expect(shouldOverwriteLocation("linkedin", "operator")).toBe(true);
    expect(shouldOverwriteLocation("operator", "linkedin")).toBe(false);
  });
  it("claimer is never overwritten by operator or linkedin", () => {
    expect(shouldOverwriteLocation("claimer", "operator")).toBe(false);
    expect(shouldOverwriteLocation("claimer", "linkedin")).toBe(false);
  });
  it("equal source overwrites (re-write allowed)", () => {
    expect(shouldOverwriteLocation("operator", "operator")).toBe(true);
  });
  it("rank order is linkedin < operator < claimer", () => {
    expect(LOCATION_RANK.linkedin).toBeLessThan(LOCATION_RANK.operator);
    expect(LOCATION_RANK.operator).toBeLessThan(LOCATION_RANK.claimer);
  });
});

import { describe, it, expect } from "vitest";
import { toSubjectLocation } from "@/lib/row-enrichment";

describe("toSubjectLocation", () => {
  it("uses structured city/region/country when present", () => {
    expect(toSubjectLocation({ city: "Austin", region: "TX", country: "USA" })).toEqual({
      city: "Austin", region: "TX", country: "USA", raw: "Austin, TX, USA",
    });
  });
  it("falls back to parsing locationRaw when no structured fields", () => {
    expect(toSubjectLocation({ locationRaw: "London, United Kingdom" })).toEqual({
      city: "London", region: null, country: "United Kingdom", raw: "London, United Kingdom",
    });
  });
  it("partial structured (city only) still builds raw + leaves missing null", () => {
    expect(toSubjectLocation({ city: "Berlin" })).toEqual({
      city: "Berlin", region: null, country: null, raw: "Berlin",
    });
  });
  it("empty input → all null", () => {
    expect(toSubjectLocation({})).toEqual({ city: null, region: null, country: null, raw: null });
  });
});

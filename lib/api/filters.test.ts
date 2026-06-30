import { describe, it, expect } from "vitest";
import { parseFilters } from "@/lib/api/filters";

const p = (s: string) => new URLSearchParams(s);

describe("parseFilters", () => {
  it("accepts a full state name and a USPS abbreviation", () => {
    expect(parseFilters(p("state=California")).filters.state).toBe("California");
    expect(parseFilters(p("state=ca")).filters.state).toBe("California");
  });

  it("rejects an unknown state", () => {
    const r = parseFilters(p("state=Atlantis"));
    expect(r.errors).toHaveLength(1);
    expect(r.filters.state).toBeUndefined();
  });

  it("validates enum dimensions", () => {
    const r = parseFilters(p("skillset=Backend&tech_depth=10x+Developer"));
    expect(r.errors).toEqual([]);
    expect(r.filters.skillset).toBe("Backend");
    expect(r.filters.tech_depth).toBe("10x Developer");
  });

  it("flags an invalid enum value", () => {
    expect(parseFilters(p("skillset=Underwater")).errors).toHaveLength(1);
  });

  it("validates builder_interest", () => {
    expect(parseFilters(p("builder_interest=builder")).filters.builder_interest).toBe("builder");
    expect(parseFilters(p("builder_interest=maybe")).errors).toHaveLength(1);
  });

  it("validates country against the allow-list", () => {
    expect(parseFilters(p("country=Canada")).filters.country).toBe("Canada");
    expect(parseFilters(p("country=United+States")).filters.country).toBe("United States");
    const r = parseFilters(p("country=Atlantis"));
    expect(r.errors).toHaveLength(1);
    expect(r.filters.country).toBeUndefined();
  });

  it("ignores absent params", () => {
    const r = parseFilters(p(""));
    expect(r.errors).toEqual([]);
    expect(Object.keys(r.filters)).toEqual([]);
  });
});

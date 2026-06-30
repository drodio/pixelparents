import { describe, it, expect } from "vitest";
import { buildMarkers, STATE_CENTROIDS, COUNTRY_CENTROIDS } from "@/lib/community-map";
import { COUNTRIES } from "@/lib/options";

describe("community-map", () => {
  it("has a centroid for all 50 states", () => {
    expect(Object.keys(STATE_CENTROIDS)).toHaveLength(50);
  });

  it("has a centroid for every non-US country in COUNTRIES", () => {
    // United States is intentionally excluded (US plots by state).
    const nonUs = COUNTRIES.filter((c) => c !== "United States");
    for (const c of nonUs) {
      expect(COUNTRY_CENTROIDS[c], `missing centroid for ${c}`).toBeDefined();
    }
    expect(Object.keys(COUNTRY_CENTROIDS)).toHaveLength(nonUs.length);
    // No accidental US national pin.
    expect(COUNTRY_CENTROIDS["United States"]).toBeUndefined();
  });

  it("builds geo markers, drops unknown names, sorts by count desc", () => {
    const m = buildMarkers({ California: 10, Texas: 3, Atlantis: 5 });
    expect(m).toHaveLength(2);
    expect(m[0].name).toBe("California");
    expect(m[0].lat).toBeCloseTo(37.2, 1);
    expect(m[0].lon).toBeCloseTo(-119.5, 1);
  });

  it("is backward-compatible when called with only a state map", () => {
    const m = buildMarkers({ California: 4 });
    expect(m).toHaveLength(1);
    expect(m[0].name).toBe("California");
  });

  it("plots international families by country centroid alongside US states", () => {
    const m = buildMarkers({ California: 2 }, { Canada: 7, India: 3, Atlantis: 9 });
    const names = m.map((x) => x.name);
    expect(names).toContain("California");
    expect(names).toContain("Canada");
    expect(names).toContain("India");
    // Unknown country dropped.
    expect(names).not.toContain("Atlantis");
    // Sorted largest-first across both sources.
    expect(m[0].name).toBe("Canada");
    const canada = m.find((x) => x.name === "Canada")!;
    expect(canada.lat).toBeCloseTo(56.1, 1);
    expect(canada.lon).toBeCloseTo(-106.3, 1);
  });

  it("never double-plots United States from the country map", () => {
    const m = buildMarkers({ California: 5 }, { "United States": 12 });
    expect(m).toHaveLength(1);
    expect(m[0].name).toBe("California");
    expect(m.some((x) => x.name === "United States")).toBe(false);
  });

  it("drops zero counts", () => {
    const m = buildMarkers({ Texas: 0 }, { Canada: 0 });
    expect(m).toHaveLength(0);
  });
});

import { describe, it, expect } from "vitest";
import { buildMarkers, STATE_CENTROIDS } from "@/lib/community-map";

describe("community-map", () => {
  it("has a centroid for all 50 states", () => {
    expect(Object.keys(STATE_CENTROIDS)).toHaveLength(50);
  });

  it("builds geo markers, drops unknown names, sorts by count desc", () => {
    const m = buildMarkers({ California: 10, Texas: 3, Atlantis: 5 });
    expect(m).toHaveLength(2);
    expect(m[0].name).toBe("California");
    expect(m[0].lat).toBeCloseTo(37.2, 1);
    expect(m[0].lon).toBeCloseTo(-119.5, 1);
  });
});

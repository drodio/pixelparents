import { describe, it, expect } from "vitest";
import { percentileFromCounts } from "@/lib/leaderboard";

describe("percentileFromCounts", () => {
  it("computes percentile, rankFromTop, and echoes total", () => {
    // 80 of 100 peers below me → 80th percentile, ranked 20th from top.
    expect(percentileFromCounts(80, 100)).toEqual({ percentile: 80, rankFromTop: 20, total: 100 });
  });
  it("rounds to the nearest whole percentile", () => {
    expect(percentileFromCounts(1, 3).percentile).toBe(33); // 33.33 → 33
    expect(percentileFromCounts(2, 3).percentile).toBe(67); // 66.66 → 67
  });
  it("returns a safe default when the population is empty", () => {
    expect(percentileFromCounts(0, 0)).toEqual({ percentile: 0, rankFromTop: 1, total: 0 });
  });
  it("top of the pack: everyone below me", () => {
    expect(percentileFromCounts(99, 100)).toEqual({ percentile: 99, rankFromTop: 1, total: 100 });
  });
});

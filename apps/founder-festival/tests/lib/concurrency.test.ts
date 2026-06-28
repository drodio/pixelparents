import { describe, it, expect } from "vitest";
import { runPool } from "@/lib/concurrency";

describe("runPool", () => {
  it("processes every item exactly once", async () => {
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await runPool(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      await Promise.resolve();
      inFlight--;
    });
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1); // actually ran concurrently
  });

  it("handles an empty list without hanging", async () => {
    let calls = 0;
    await runPool([], 5, async () => {
      calls++;
    });
    expect(calls).toBe(0);
  });
});

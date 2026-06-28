import { describe, it, expect } from "vitest";
import { medianCents, pickEstimateCents } from "@/lib/estimate-tuner";

describe("medianCents", () => {
  it("returns the single value", () => {
    expect(medianCents([42])).toBe(42);
  });

  it("returns the middle of an odd-length set, regardless of order", () => {
    expect(medianCents([30, 10, 20])).toBe(20);
  });

  it("averages the two middles of an even-length set", () => {
    expect(medianCents([10, 20, 30, 40])).toBe(25);
  });

  it("rounds a fractional median to whole cents", () => {
    expect(medianCents([10, 25])).toBe(18); // round(17.5)
  });

  it("is unmoved by a single runaway value (why median, not mean)", () => {
    expect(medianCents([10, 10, 10, 10, 1000])).toBe(10);
  });
});

describe("pickEstimateCents", () => {
  it("falls back to the constant below the sample minimum", () => {
    expect(pickEstimateCents([35, 35, 35, 35], 13, 5)).toBe(13);
  });

  it("uses the median once the sample minimum is met", () => {
    expect(pickEstimateCents([10, 20, 30, 40, 50], 99, 5)).toBe(30);
  });

  it("treats an empty sample set as the fallback", () => {
    expect(pickEstimateCents([], 13, 5)).toBe(13);
  });

  it("defaults the minimum to 5 samples", () => {
    expect(pickEstimateCents([10, 20, 30, 40], 13)).toBe(13);
    expect(pickEstimateCents([10, 20, 30, 40, 50], 13)).toBe(30);
  });
});

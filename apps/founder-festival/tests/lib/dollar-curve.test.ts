import { describe, it, expect } from "vitest";
import { enterpriseValuePoints, curvedDollarPoints, DOLLAR_SQRT_PER_100B } from "@/lib/scoring";

describe("enterpriseValuePoints (square-root curve, no cap)", () => {
  it("scales so a $100B company ≈ the configured points", () => {
    expect(DOLLAR_SQRT_PER_100B).toBe(300);
    expect(enterpriseValuePoints(100_000_000_000)).toBe(300); // $100B → 300
  });
  it("is proportional-feeling, not log-flat (a bigger company is worth meaningfully more)", () => {
    expect(enterpriseValuePoints(200_000_000)).toBe(13); // $200M
    expect(enterpriseValuePoints(1_000_000_000)).toBe(30); // $1B
    expect(enterpriseValuePoints(12_700_000_000)).toBe(107); // Groupon $12.7B
    expect(enterpriseValuePoints(91_500_000_000)).toBe(287); // Stripe $91.5B
    expect(enterpriseValuePoints(1_740_000_000_000)).toBe(1251); // Microsoft $1.74T
  });
  it("Stripe earns ~2.7× Groupon (sqrt), not the ~1.2× the old log curve gave", () => {
    const ratio = enterpriseValuePoints(91_500_000_000) / enterpriseValuePoints(12_700_000_000);
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3);
  });
  it("has NO cap — a generational company far outscores a merely-large one", () => {
    expect(enterpriseValuePoints(1_740_000_000_000)).toBeGreaterThan(enterpriseValuePoints(91_500_000_000) * 4);
  });
  it("floors zero / garbage at 0", () => {
    expect(enterpriseValuePoints(0)).toBe(0);
    expect(enterpriseValuePoints(NaN)).toBe(0);
  });
});

describe("curvedDollarPoints (rule-gated; recovers $ from linear points)", () => {
  it("curves outcome rows at full weight", () => {
    expect(curvedDollarPoints("founder_exit", 12_700)).toBe(107); // Groupon $12.7B
    expect(curvedDollarPoints("founder_valuation", 91_500)).toBe(287); // Stripe $91.5B
    expect(curvedDollarPoints("founder_exit", 1_736_900)).toBe(1250); // Microsoft ~$1.7369T — uncapped
  });
  it("curves venture_raised at half weight (capital taken in, not value created)", () => {
    expect(curvedDollarPoints("venture_raised", 201)).toBe(7); // $201M raised → ~13 × 0.5
  });
  it("leaves non-dollar rules untouched (returns null)", () => {
    expect(curvedDollarPoints("github_top_repo", 132)).toBeNull();
    expect(curvedDollarPoints(undefined, 100)).toBeNull();
    expect(curvedDollarPoints(null, 100)).toBeNull();
  });
  it("ignores zero/negative points", () => {
    expect(curvedDollarPoints("founder_exit", 0)).toBeNull();
  });
});

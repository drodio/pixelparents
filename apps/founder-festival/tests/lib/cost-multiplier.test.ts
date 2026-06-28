import { describe, it, expect } from "vitest";
import {
  DEFAULT_COST_MULTIPLIER,
  clampCostMultiplier,
  applyCostMultiplier,
  effectiveCostMultiplier,
} from "@/lib/cost-multiplier";

describe("clampCostMultiplier", () => {
  it("keeps valid integers ≥ 1", () => {
    expect(clampCostMultiplier(10)).toBe(10);
    expect(clampCostMultiplier(1)).toBe(1);
    expect(clampCostMultiplier(25)).toBe(25);
  });

  it("floors below the minimum of 1", () => {
    expect(clampCostMultiplier(0)).toBe(1);
    expect(clampCostMultiplier(-5)).toBe(1);
    expect(clampCostMultiplier(0.5)).toBe(1);
  });

  it("coerces numeric strings and truncates", () => {
    expect(clampCostMultiplier("20")).toBe(20);
    expect(clampCostMultiplier(12.9)).toBe(12);
  });

  it("falls back to the default for non-numbers", () => {
    expect(clampCostMultiplier("abc")).toBe(DEFAULT_COST_MULTIPLIER);
    expect(clampCostMultiplier(null)).toBe(DEFAULT_COST_MULTIPLIER);
    expect(clampCostMultiplier(undefined)).toBe(DEFAULT_COST_MULTIPLIER);
    expect(clampCostMultiplier(NaN)).toBe(DEFAULT_COST_MULTIPLIER);
  });
});

describe("applyCostMultiplier", () => {
  it("multiplies cents by the multiplier (rounded)", () => {
    expect(applyCostMultiplier(100, 10)).toBe(1000);
    expect(applyCostMultiplier(7, 10)).toBe(70);
    expect(applyCostMultiplier(0, 10)).toBe(0);
    expect(applyCostMultiplier(33, 1)).toBe(33);
  });

  it("passes null/undefined through as null (unknown cost)", () => {
    expect(applyCostMultiplier(null, 10)).toBeNull();
    expect(applyCostMultiplier(undefined, 10)).toBeNull();
  });
});

describe("effectiveCostMultiplier", () => {
  it("is 1 for privileged viewers (super-admin / env admin), regardless of role", () => {
    expect(effectiveCostMultiplier({ privileged: true, roleMultiplier: 10 })).toBe(1);
    expect(effectiveCostMultiplier({ privileged: true, roleMultiplier: null })).toBe(1);
  });

  it("is 1 for a no-role (legacy) admin", () => {
    expect(effectiveCostMultiplier({ privileged: false, roleMultiplier: null })).toBe(1);
  });

  it("uses the role's multiplier (clamped ≥ 1) for a role-based admin", () => {
    expect(effectiveCostMultiplier({ privileged: false, roleMultiplier: 10 })).toBe(10);
    expect(effectiveCostMultiplier({ privileged: false, roleMultiplier: 0 })).toBe(1);
  });
});

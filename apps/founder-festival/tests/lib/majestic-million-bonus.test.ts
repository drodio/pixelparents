import { describe, it, expect } from "vitest";
import { majesticMillionBonus } from "@/lib/scoring";

describe("majesticMillionBonus — log curve (K=20)", () => {
  const F = { isFounder: true };
  it("rewards across the full rank range (no cliff at 10k)", () => {
    expect(majesticMillionBonus(1, F)).toBe(120);
    expect(majesticMillionBonus(100, F)).toBe(80);
    expect(majesticMillionBonus(1_000, F)).toBe(60);
    expect(majesticMillionBonus(10_000, F)).toBe(40);
    expect(majesticMillionBonus(100_000, F)).toBe(20);
    expect(majesticMillionBonus(1_000_000, F)).toBe(0);
  });

  it("gives apollographql.com (#25,405) a modest bonus instead of +0", () => {
    expect(majesticMillionBonus(25_405, F)).toBe(32);
  });

  it("scales a non-founder employee down by ~10x", () => {
    expect(majesticMillionBonus(100, { isFounder: false })).toBe(8); // round(80 * 0.1)
    expect(majesticMillionBonus(25_405, { isFounder: false })).toBe(3); // round(32 * 0.1)
  });

  it("never goes negative and ignores garbage ranks", () => {
    expect(majesticMillionBonus(0, F)).toBe(0);
    expect(majesticMillionBonus(-5, F)).toBe(0);
    expect(majesticMillionBonus(Number.NaN, F)).toBe(0);
    expect(majesticMillionBonus(2_000_000, F)).toBe(0); // past the table → clamped to 0
  });
});

import { describe, it, expect } from "vitest";
import { clampBreakdown } from "@/lib/scoring";

// Rubric v0.0.4: the per-row +200 upper clamp is bypassed for two rules where
// the magnitude IS the signal — "venture_raised" and "github_top_repo".
// The -50 lower clamp continues to apply to every row.

describe("clampBreakdown — rubric v0.0.4", () => {
  it("clamps default rules to +200 / -50", () => {
    const out = clampBreakdown([
      { points: 1000, reason: "huge" },
      { points: -500, reason: "tiny" },
      { points: 50, reason: "normal" },
    ]);
    expect(out[0]!.points).toBe(200);
    expect(out[1]!.points).toBe(-50);
    expect(out[2]!.points).toBe(50);
  });

  it("leaves venture_raised UNCAPPED on the upper end", () => {
    const out = clampBreakdown([
      { points: 84, reason: "Raised $84.9M", rule: "venture_raised" as const },
      { points: 1000, reason: "Raised $1B", rule: "venture_raised" as const },
    ]);
    expect(out[0]!.points).toBe(84);
    expect(out[1]!.points).toBe(1000);
  });

  it("still applies the -50 lower clamp to venture_raised", () => {
    const out = clampBreakdown([
      { points: -200, reason: "weird", rule: "venture_raised" as const },
    ]);
    expect(out[0]!.points).toBe(-50);
  });

  it("leaves founder_valuation UNCAPPED on the upper end", () => {
    const out = clampBreakdown([
      // $1.5B valuation → +1500, must survive the +200 clamp.
      { points: 1500, reason: "Apollo last valued at $1.5B", rule: "founder_valuation" as const },
    ]);
    expect(out[0]!.points).toBe(1500);
  });

  it("leaves github_top_repo UNCAPPED on the upper end", () => {
    const out = clampBreakdown([
      // 100k stars → 20 × log10(100000) = 100
      { points: 100, reason: "100k stars", rule: "github_top_repo" as const },
      // 1M stars → ~120
      { points: 120, reason: "1M stars", rule: "github_top_repo" as const },
      // and the no-upper-clamp matters at outlier scale
      { points: 300, reason: "fictional outlier", rule: "github_top_repo" as const },
    ]);
    expect(out[0]!.points).toBe(100);
    expect(out[1]!.points).toBe(120);
    expect(out[2]!.points).toBe(300);
  });

  it("truncates fractional input regardless of rule", () => {
    const out = clampBreakdown([
      { points: 84.7, reason: "frac", rule: "venture_raised" as const },
      { points: 12.9, reason: "frac" },
    ]);
    expect(out[0]!.points).toBe(84);
    expect(out[1]!.points).toBe(12);
  });

  it("unknown rule string is treated as default-clamped (defensive)", () => {
    const out = clampBreakdown([
      // @ts-expect-error — testing runtime defensiveness
      { points: 1000, reason: "?", rule: "made_up_rule" },
    ]);
    // Falls through to the default +200 ceiling.
    expect(out[0]!.points).toBe(200);
  });

  it("leaves a founder_exit row uncapped above +200", () => {
    const out = clampBreakdown([
      { points: 11000, reason: "GitLab IPO at ~$11B market cap.", rule: "founder_exit" as const },
    ]);
    expect(out[0]!.points).toBe(11000);
  });

  it("still applies the -50 lower clamp to founder_exit", () => {
    const out = clampBreakdown([
      { points: -999, reason: "bogus", rule: "founder_exit" as const },
    ]);
    expect(out[0]!.points).toBe(-50);
  });
});

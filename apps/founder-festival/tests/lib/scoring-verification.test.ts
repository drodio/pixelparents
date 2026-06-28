import { describe, it, expect } from "vitest";
import { applyVerificationWeighting, shouldEscalate, isConfident } from "@/lib/scoring";

// MODEL CASCADE: escalate cheap→Opus when a high-value row is weakly evidenced
// or low-confidence. Computed on pre-weighting points.
describe("shouldEscalate", () => {
  const row = (points: number, verification: string, confidence = 90) =>
    ({ points, reason: "x", confidence, verification, sources: [] }) as never;
  const sc = (founder: unknown[], investor: unknown[] = []) =>
    ({ founderBreakdown: founder, investorBreakdown: investor }) as never;

  it("escalates on a high-value self-asserted row", () => {
    expect(shouldEscalate(sc([row(80, "self-asserted")]))).toBe(true);
  });
  it("escalates on a high-value single-source row", () => {
    expect(shouldEscalate(sc([row(50, "single-source")]))).toBe(true);
  });
  it("escalates on a high-value low-confidence row (even if corroborated)", () => {
    expect(shouldEscalate(sc([row(40, "corroborated", 45)]))).toBe(true);
  });
  it("does NOT escalate a well-corroborated, confident high-value row", () => {
    expect(shouldEscalate(sc([row(200, "corroborated", 95)]))).toBe(false);
    expect(shouldEscalate(sc([row(100, "authoritative", 90)]))).toBe(false);
  });
  it("does NOT escalate weak/low-conf rows that are LOW value (<25 pts)", () => {
    expect(shouldEscalate(sc([row(10, "self-asserted", 20)]))).toBe(false);
  });
  it("checks investor rows too", () => {
    expect(shouldEscalate(sc([], [row(30, "self-asserted")]))).toBe(true);
  });
  it("does not escalate an empty breakdown", () => {
    expect(shouldEscalate(sc([], []))).toBe(false);
  });
});

// DOUBLE-VERIFICATION: high-value rows (|points| >= 25) are down-weighted by
// evidence tier; low-value rows pass through untouched. No caps.
describe("applyVerificationWeighting", () => {
  it("leaves authoritative/corroborated high-value rows at full weight", () => {
    const out = applyVerificationWeighting([
      { points: 200, verification: "authoritative" as const },
      { points: 50, verification: "corroborated" as const },
    ]);
    expect(out[0]!.points).toBe(200);
    expect(out[1]!.points).toBe(50);
  });

  it("down-weights high-value single-source (×0.6) and self-asserted (×0.25)", () => {
    const out = applyVerificationWeighting([
      { points: 50, verification: "single-source" as const }, // 30
      { points: 80, verification: "self-asserted" as const }, // 20
    ]);
    expect(out[0]!.points).toBe(30);
    expect(out[1]!.points).toBe(20);
  });

  it("leaves LOW-value rows untouched regardless of tier", () => {
    const out = applyVerificationWeighting([
      { points: 10, verification: "self-asserted" as const },
      { points: 24, verification: "self-asserted" as const }, // just under threshold
      { points: 1, verification: "single-source" as const },
    ]);
    expect(out.map((r) => r.points)).toEqual([10, 24, 1]);
  });

  it("defaults missing verification to single-source for high-value rows", () => {
    const out = applyVerificationWeighting([{ points: 100 }]);
    expect(out[0]!.points).toBe(60); // 100 × 0.6
  });

  it("applies to negative high-value rows too (truncates)", () => {
    const out = applyVerificationWeighting([{ points: -50, verification: "self-asserted" as const }]);
    expect(out[0]!.points).toBe(-12); // trunc(-50 × 0.25) = trunc(-12.5) = -12
  });

  it("preserves other fields on the row", () => {
    const out = applyVerificationWeighting([
      { points: 80, verification: "self-asserted" as const, reason: "x", confidence: 30 },
    ]);
    expect(out[0]).toMatchObject({ points: 20, reason: "x", confidence: 30 });
  });

  it("does not cap totals or row count (sum can be arbitrarily large)", () => {
    const rows = Array.from({ length: 50 }, () => ({ points: 200, verification: "corroborated" as const }));
    const out = applyVerificationWeighting(rows);
    expect(out.reduce((s, r) => s + r.points, 0)).toBe(10000);
  });
});

// 3-TIER LADDER GATE: a model's result is accepted at its tier only when the
// data was solid AND the model itself was confident on every row (min-confidence
// gate). Any shaky row, or low signalQuality, hands off to the next model.
describe("isConfident", () => {
  const row = (confidence: number) => ({ points: 10, reason: "x", confidence, verification: "single-source", sources: [] }) as never;
  const sc = (signalQuality: string, founder: unknown[], investor: unknown[] = []) =>
    ({ signalQuality, founderBreakdown: founder, investorBreakdown: investor }) as never;

  it("accepts when every row meets the bar and signal isn't low", () => {
    expect(isConfident(sc("high", [row(95), row(98)], [row(96)]), 95)).toBe(true);
  });
  it("rejects when any single row is below the bar (min gates, not avg)", () => {
    expect(isConfident(sc("high", [row(99), row(80)]), 95)).toBe(false);
  });
  it("rejects low signalQuality regardless of row confidence", () => {
    expect(isConfident(sc("low", [row(100)]), 95)).toBe(false);
  });
  it("checks investor rows too", () => {
    expect(isConfident(sc("medium", [row(99)], [row(50)]), 95)).toBe(false);
  });
  it("accepts an empty breakdown when signal isn't low (no row fails the bar)", () => {
    expect(isConfident(sc("medium", [], []), 95)).toBe(true);
  });
  it("treats a missing confidence as 0 (fails any positive bar)", () => {
    const noConf = { points: 10, reason: "x", verification: "single-source", sources: [] } as never;
    expect(isConfident(sc("high", [noConf]), 85)).toBe(false);
  });
  it("applies the threshold inclusively (>= bar passes)", () => {
    expect(isConfident(sc("high", [row(85)]), 85)).toBe(true);
  });
});

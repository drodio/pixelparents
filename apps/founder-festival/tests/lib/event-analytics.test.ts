import { describe, it, expect } from "vitest";
import { classifyRole, computeCohortStats } from "@/lib/event-analytics";

describe("classifyRole", () => {
  it("higher score wins; ties go to founder", () => {
    expect(classifyRole({ founderScore: 80, investorScore: 20 })).toBe("founder");
    expect(classifyRole({ founderScore: 10, investorScore: 90 })).toBe("investor");
    expect(classifyRole({ founderScore: 50, investorScore: 50 })).toBe("founder");
  });
});

describe("computeCohortStats", () => {
  it("counts founders/investors by status — someone can be BOTH", () => {
    const s = computeCohortStats([
      { founderScore: 80, investorScore: 0, founderStatus: "current", investorStatus: "never" },
      { founderScore: 60, investorScore: 40, founderStatus: "past", investorStatus: "current" }, // both
      { founderScore: 0, investorScore: 90, founderStatus: "never", investorStatus: "current" },
    ]);
    expect(s.founderCount).toBe(2); // first two
    expect(s.investorCount).toBe(2); // last two
    expect(s.founderInvestorRatio).toBe(1);
    expect(s.avgFounderScore).toBe(70); // (80+60)/2
    expect(s.avgInvestorScore).toBe(65); // (40+90)/2
  });

  it("falls back to score when status is unknown (older evals)", () => {
    const s = computeCohortStats([
      { founderScore: 50, investorScore: 0 }, // founder by score
      { founderScore: 0, investorScore: 30 }, // investor by score
    ]);
    expect(s.founderCount).toBe(1);
    expect(s.investorCount).toBe(1);
  });

  it("handles an empty cohort", () => {
    const s = computeCohortStats([]);
    expect(s).toEqual({
      founderCount: 0,
      investorCount: 0,
      founderInvestorRatio: null,
      avgFounderScore: 0,
      avgInvestorScore: 0,
    });
  });

  it("ratio is null with no investors", () => {
    const s = computeCohortStats([{ founderScore: 50, investorScore: 0 }]);
    expect(s.founderInvestorRatio).toBeNull();
    expect(s.founderCount).toBe(1);
  });
});

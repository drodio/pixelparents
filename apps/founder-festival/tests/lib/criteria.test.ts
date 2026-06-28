import { describe, it, expect } from "vitest";
import { evaluateCriteria, type Criteria, type ApplicantSnapshot } from "@/lib/criteria";

const base: Criteria = {
  side: "either",
  founderScoreMin: 0,
  investorScoreMin: 0,
  stages: ["pre-seed", "seed", "series-a", "series-b", "series-c+"],
};

function snapshot(overrides: Partial<ApplicantSnapshot> = {}): ApplicantSnapshot {
  return {
    founderScore: 0,
    investorScore: 0,
    companyStage: null,
    investorStageFocus: [],
    bypassCodeMatched: false,
    ...overrides,
  };
}

describe("evaluateCriteria", () => {
  it("approves when bypass code matches, ignoring criteria", () => {
    const r = evaluateCriteria(base, snapshot({ bypassCodeMatched: true }));
    expect(r.decision).toBe("approved");
    expect(r.reason).toMatch(/bypass/i);
  });

  it("approves a founder at the score floor", () => {
    const c: Criteria = { ...base, side: "founder", founderScoreMin: 80 };
    const r = evaluateCriteria(c, snapshot({ founderScore: 80, companyStage: "seed" }));
    expect(r.decision).toBe("approved");
  });

  it("denies a founder below score floor", () => {
    const c: Criteria = { ...base, side: "founder", founderScoreMin: 80 };
    const r = evaluateCriteria(c, snapshot({ founderScore: 30, companyStage: "seed" }));
    expect(r.decision).toBe("denied");
    expect(r.reason).toMatch(/score/i);
  });

  it("denies a founder out of stage allow-list", () => {
    const c: Criteria = { ...base, side: "founder", stages: ["pre-seed"] };
    const r = evaluateCriteria(c, snapshot({ founderScore: 200, companyStage: "series-b" }));
    expect(r.decision).toBe("denied");
    expect(r.reason).toMatch(/stage/i);
  });

  it("flags review on either-side event when both scores are near-miss", () => {
    const c: Criteria = { ...base, side: "either", founderScoreMin: 100, investorScoreMin: 100 };
    const r = evaluateCriteria(c, snapshot({ founderScore: 80, investorScore: 80 }));
    expect(r.decision).toBe("review");
  });

  it("approves an investor on side=investor when investorScore qualifies", () => {
    const c: Criteria = { ...base, side: "investor", investorScoreMin: 50 };
    const r = evaluateCriteria(c, snapshot({ investorScore: 75, investorStageFocus: ["seed"] }));
    expect(r.decision).toBe("approved");
  });

  it("respects investorStageFocus when stages are restricted", () => {
    const c: Criteria = { ...base, side: "investor", investorScoreMin: 0, stages: ["pre-seed"] };
    const r = evaluateCriteria(c, snapshot({ investorScore: 50, investorStageFocus: ["seed", "series-a"] }));
    expect(r.decision).toBe("denied");
  });

  it("skips founder stage check when companyStage is null (pending-score window)", () => {
    const c: Criteria = { ...base, side: "founder", stages: ["seed"], founderScoreMin: 50 };
    const r = evaluateCriteria(c, snapshot({ founderScore: 75, companyStage: null }));
    expect(r.decision).toBe("approved");
  });

  it("skips investor stage check when investorStageFocus is empty", () => {
    const c: Criteria = { ...base, side: "investor", stages: ["seed"], investorScoreMin: 50 };
    const r = evaluateCriteria(c, snapshot({ investorScore: 75, investorStageFocus: [] }));
    expect(r.decision).toBe("approved");
  });
});

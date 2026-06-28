export type Side = "founder" | "investor" | "either";
export type Stage =
  | "idea"
  | "pre-seed"
  | "seed"
  | "series-a"
  | "series-b"
  | "series-c+"
  | "growth"
  | "public"
  | "acquired";

export type Criteria = {
  side: Side;
  founderScoreMin: number;
  investorScoreMin: number;
  stages: Stage[]; // empty array = any
  geo?: string[]; // ISO country codes, empty = any
};

export type ApplicantSnapshot = {
  founderScore: number;
  investorScore: number;
  companyStage: Stage | null;
  investorStageFocus: Stage[];
  bypassCodeMatched: boolean;
};

export type Decision = "approved" | "denied" | "review";

export type EvaluateResult = {
  decision: Decision;
  reason: string;
};

const REVIEW_NEAR_MISS_PCT = 0.7; // within 70% of floor → review, not denial

export function evaluateCriteria(c: Criteria, a: ApplicantSnapshot): EvaluateResult {
  if (a.bypassCodeMatched) {
    return { decision: "approved", reason: "auto:bypass_code" };
  }

  const tryFounder = c.side === "founder" || c.side === "either";
  const tryInvestor = c.side === "investor" || c.side === "either";

  const founderOk: EvaluateResult | null = tryFounder ? checkFounder(c, a) : null;
  const investorOk: EvaluateResult | null = tryInvestor ? checkInvestor(c, a) : null;

  if (founderOk?.decision === "approved") {
    return { decision: "approved", reason: founderOk.reason };
  }
  if (investorOk?.decision === "approved") {
    return { decision: "approved", reason: investorOk.reason };
  }

  // Neither approved. If either is "review" (near-miss), flag for human.
  if (founderOk?.decision === "review" || investorOk?.decision === "review") {
    return { decision: "review", reason: "near-miss criteria; admin review" };
  }

  // Otherwise: deny with the most specific reason from whichever side was attempted.
  if (tryFounder && tryInvestor) {
    return { decision: "denied", reason: "below founder and investor criteria" };
  }
  if (founderOk) return founderOk;
  if (investorOk) return investorOk;
  // Unreachable given current Side union, but guards against future side values
  // that aren't handled by the tryFounder/tryInvestor predicates above.
  return { decision: "review", reason: `unknown side: ${c.side as string}` };
}

function checkFounder(c: Criteria, a: ApplicantSnapshot): EvaluateResult {
  if (c.stages.length > 0 && a.companyStage && !c.stages.includes(a.companyStage)) {
    return { decision: "denied", reason: `founder stage ${a.companyStage} not in allow-list` };
  }
  if (a.founderScore >= c.founderScoreMin) {
    return {
      decision: "approved",
      reason: `auto:founder_score:${a.founderScore}>=${c.founderScoreMin}`,
    };
  }
  if (a.founderScore >= Math.floor(c.founderScoreMin * REVIEW_NEAR_MISS_PCT)) {
    return {
      decision: "review",
      reason: `founder score ${a.founderScore} near floor ${c.founderScoreMin}`,
    };
  }
  return {
    decision: "denied",
    reason: `founder score ${a.founderScore} below floor ${c.founderScoreMin}`,
  };
}

function checkInvestor(c: Criteria, a: ApplicantSnapshot): EvaluateResult {
  if (c.stages.length > 0 && a.investorStageFocus.length > 0) {
    const overlap = a.investorStageFocus.some((s) => c.stages.includes(s));
    if (!overlap) {
      return {
        decision: "denied",
        reason: `investor stage focus ${a.investorStageFocus.join(",")} doesn't overlap allow-list`,
      };
    }
  }
  if (a.investorScore >= c.investorScoreMin) {
    return {
      decision: "approved",
      reason: `auto:investor_score:${a.investorScore}>=${c.investorScoreMin}`,
    };
  }
  if (a.investorScore >= Math.floor(c.investorScoreMin * REVIEW_NEAR_MISS_PCT)) {
    return {
      decision: "review",
      reason: `investor score ${a.investorScore} near floor ${c.investorScoreMin}`,
    };
  }
  return {
    decision: "denied",
    reason: `investor score ${a.investorScore} below floor ${c.investorScoreMin}`,
  };
}

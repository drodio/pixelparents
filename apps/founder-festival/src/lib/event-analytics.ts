// Pure helpers for per-event analytics. Side-effect free + unit tested; the DB
// query that feeds these lives in src/lib/events.ts (getEventAnalytics).

export type ScoredAttendee = {
  founderScore: number;
  investorScore: number;
  founderStatus?: "current" | "past" | "never" | null;
  investorStatus?: "current" | "past" | "never" | null;
};

// Canonical SINGLE role pick (whichever score is higher; ties → founder). Used
// for connection grouping where a person must land in exactly one bucket.
export function classifyRole(a: ScoredAttendee): "founder" | "investor" {
  return a.investorScore > a.founderScore ? "investor" : "founder";
}

// Cohort membership for the event "By the numbers" counts. Someone is a founder
// if they're a CURRENT or PAST founder (status) — regardless of how their
// investor score compares — and an investor on the same basis, so a founder who
// also invests is counted in BOTH. When status is unknown (older evals), fall
// back to whether they have any score on that dimension.
export function isFounder(a: ScoredAttendee): boolean {
  if (a.founderStatus === "current" || a.founderStatus === "past") return true;
  if (a.founderStatus === "never") return false;
  return a.founderScore > 0;
}
export function isInvestor(a: ScoredAttendee): boolean {
  if (a.investorStatus === "current" || a.investorStatus === "past") return true;
  if (a.investorStatus === "never") return false;
  return a.investorScore > 0;
}

export type CohortStats = {
  founderCount: number;
  investorCount: number;
  /** founders ÷ investors, or null when there are no investors. */
  founderInvestorRatio: number | null;
  /** mean founderScore across the founder cohort (0 when empty). */
  avgFounderScore: number;
  /** mean investorScore across the investor cohort (0 when empty). */
  avgInvestorScore: number;
};

function mean(ns: number[]): number {
  if (ns.length === 0) return 0;
  return Math.round(ns.reduce((s, n) => s + n, 0) / ns.length);
}

// Count founders + investors (a person can be both — see isFounder/isInvestor)
// and average each cohort's own score. Only attendees with a score should be
// passed in (unmatched/unscored excluded).
export function computeCohortStats(scored: ScoredAttendee[]): CohortStats {
  const founders = scored.filter(isFounder);
  const investors = scored.filter(isInvestor);
  return {
    founderCount: founders.length,
    investorCount: investors.length,
    founderInvestorRatio:
      investors.length === 0 ? null : Math.round((founders.length / investors.length) * 100) / 100,
    avgFounderScore: mean(founders.map((a) => a.founderScore)),
    avgInvestorScore: mean(investors.map((a) => a.investorScore)),
  };
}

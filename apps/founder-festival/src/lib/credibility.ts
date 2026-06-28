import { and, ne } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import {
  VECTOR_KEYS,
  VECTOR_LABELS,
  VECTOR_AXIS_LABELS,
  INVESTOR_VECTOR_KEYS,
  INVESTOR_VECTOR_LABELS,
  INVESTOR_VECTOR_AXIS_LABELS,
  founderRows,
  investorRows,
  bucketByVector,
  bucketInvestorByVector,
  rawVectorPoints,
  rawInvestorVectorPoints,
  signalHaverPercentile,
  type VectorKey,
  type InvestorVectorKey,
  type VectorBucket,
} from "@/lib/credibility-vectors";

// Server-side data access for the credibility radar (FEAT-02), founder + investor.
// Wraps the pure attribution logic with the population distribution it
// percentile-ranks against.

export type RadarVector = {
  key: string;
  label: string; // full label (drill-down header)
  axisLabel: string; // short label (radar axis)
  score: number; // 0-100 percentile vs the scored population
  coverage: boolean; // has >=1 attributed evidence row (else "no direct signal")
  evidence: Array<{ points: number; reason: string }>;
};

export type CredibilityRadars = { founder: RadarVector[]; investor: RadarVector[] };

type Population = {
  founder: Record<VectorKey, number[]>;
  investor: Record<InvestorVectorKey, number[]>;
  computedAt: number;
};

// In-memory TTL cache. The population shifts slowly and profile pages are
// force-dynamic, so recomputing the full distribution every view would be
// wasteful. 5 min is plenty fresh.
let popCache: Population | null = null;
const POP_TTL_MS = 5 * 60 * 1000;

// Same denominator as computePercentile(): exclude low-signal + code-redeemed
// rows so the distribution isn't skewed by placeholders. One pass builds BOTH
// the founder and investor per-vector distributions.
async function getPopulation(): Promise<Population> {
  if (popCache && Date.now() - popCache.computedAt < POP_TTL_MS) return popCache;
  const rows = await db
    .select({ breakdown: evaluations.breakdown })
    .from(evaluations)
    .where(and(ne(evaluations.signalQuality, "low"), ne(evaluations.source, "code")));

  const founder = Object.fromEntries(VECTOR_KEYS.map((k) => [k, [] as number[]])) as Record<VectorKey, number[]>;
  const investor = Object.fromEntries(
    INVESTOR_VECTOR_KEYS.map((k) => [k, [] as number[]]),
  ) as Record<InvestorVectorKey, number[]>;
  for (const r of rows) {
    const f = rawVectorPoints(founderRows(r.breakdown));
    for (const k of VECTOR_KEYS) founder[k].push(f[k]);
    const i = rawInvestorVectorPoints(investorRows(r.breakdown));
    for (const k of INVESTOR_VECTOR_KEYS) investor[k].push(i[k]);
  }
  popCache = { founder, investor, computedAt: Date.now() };
  return popCache;
}

// Force a recompute (e.g. right after a fresh score). Cheap; safe to call.
export function invalidatePopulationCache(): void {
  popCache = null;
}

function buildRadar<K extends string>(
  buckets: Record<K, VectorBucket>,
  keys: readonly K[],
  labels: Record<K, string>,
  axisLabels: Record<K, string>,
  pop: Record<K, number[]>,
): RadarVector[] {
  return keys.map((k) => ({
    key: k,
    label: labels[k],
    axisLabel: axisLabels[k],
    score: signalHaverPercentile(buckets[k].points, pop[k] ?? []),
    coverage: buckets[k].rows.length > 0,
    evidence: buckets[k].rows
      .slice()
      .sort((a, b) => b.points - a.points)
      .map((row) => ({ points: row.points, reason: row.reason })),
  }));
}

// Average a cohort's raw per-axis points into a single RadarVector[]: the mean
// points per axis, percentile-ranked against the population. Used for the event
// recap's "average founder/investor composition" spider graphs. Evidence is
// empty (aggregate has no single drill-down) and coverage reflects whether the
// cohort had any signal on the axis.
function buildAveragedRadar<K extends string>(
  breakdowns: unknown[],
  keys: readonly K[],
  labels: Record<K, string>,
  axisLabels: Record<K, string>,
  rowsFor: (b: unknown) => import("@/lib/credibility-vectors").BreakdownRow[],
  rawPoints: (rows: import("@/lib/credibility-vectors").BreakdownRow[]) => Record<K, number>,
  pop: Record<K, number[]>,
): RadarVector[] {
  const n = breakdowns.length;
  const sums = Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
  for (const b of breakdowns) {
    const pts = rawPoints(rowsFor(b));
    for (const k of keys) sums[k] += pts[k];
  }
  return keys.map((k) => {
    const avg = n === 0 ? 0 : sums[k] / n;
    return {
      key: k,
      label: labels[k],
      axisLabel: axisLabels[k],
      score: signalHaverPercentile(avg, pop[k] ?? []),
      coverage: avg > 0,
      evidence: [],
    };
  });
}

// Averaged radars for two cohorts (founder attendees, investor attendees). Each
// cohort is the list of that cohort's profile breakdowns.
export async function getAveragedRadars(
  founderBreakdowns: unknown[],
  investorBreakdowns: unknown[],
): Promise<CredibilityRadars> {
  const pop = await getPopulation();
  return {
    founder: buildAveragedRadar(
      founderBreakdowns,
      VECTOR_KEYS,
      VECTOR_LABELS,
      VECTOR_AXIS_LABELS,
      founderRows,
      rawVectorPoints,
      pop.founder,
    ),
    investor: buildAveragedRadar(
      investorBreakdowns,
      INVESTOR_VECTOR_KEYS,
      INVESTOR_VECTOR_LABELS,
      INVESTOR_VECTOR_AXIS_LABELS,
      investorRows,
      rawInvestorVectorPoints,
      pop.investor,
    ),
  };
}

// Build both dimensions' radars for one profile's breakdown. The caller decides
// which to show (based on founderScore / investorScore).
export async function getCredibilityRadars(breakdown: unknown): Promise<CredibilityRadars> {
  const pop = await getPopulation();
  return {
    founder: buildRadar(bucketByVector(founderRows(breakdown)), VECTOR_KEYS, VECTOR_LABELS, VECTOR_AXIS_LABELS, pop.founder),
    investor: buildRadar(
      bucketInvestorByVector(investorRows(breakdown)),
      INVESTOR_VECTOR_KEYS,
      INVESTOR_VECTOR_LABELS,
      INVESTOR_VECTOR_AXIS_LABELS,
      pop.investor,
    ),
  };
}

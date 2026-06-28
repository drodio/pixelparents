import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import {
  founderRows,
  investorRows,
  rawVectorPoints,
  rawInvestorVectorPoints,
  percentileOf,
  VECTOR_KEYS,
  INVESTOR_VECTOR_KEYS,
  type VectorKey,
  type InvestorVectorKey,
} from "@/lib/credibility-vectors";
import { profileUrlFor } from "@/lib/profile-slug";

// "Founder Matrix" feature: for a given profile, compute three lists of up to
// five other people in the scored population whose radar vectors are
// (a) most similar, (b) best complement (their strengths fill your gaps),
// (c) most opposite — and link to their profiles.
//
// Math:
//   similar    — sort ascending by Euclidean distance between vectors.
//   complement — sort descending by sum_v (100 - my[v]) * their[v]. Picks
//                people who are HIGH where you're LOW.
//   opposite   — sort descending by the same Euclidean distance used for
//                similar.
//
// Cross-dimension by design: a founder-dominant profile is matched against
// EVERY scored profile using founder vectors (so an investor-dominant person
// with some founder signal can show up). Candidates whose vector on the
// chosen dimension is all zeros are excluded — without any signal on that
// dimension, they'd dominate "Most Opposite" with no real meaning.

export type MatrixDimension = "founder" | "investor";

export type MatrixCandidate = {
  evalId: string;
  fullName: string | null;
  profileHref: string;
  imageUrl: string | null;
  founderScore: number;
  investorScore: number;
  founderVector: number[]; // 5 percentile values, same order as VECTOR_KEYS
  investorVector: number[]; // 5 percentile values, same order as INVESTOR_VECTOR_KEYS
};

export type MatrixMatch = {
  evalId: string;
  fullName: string | null;
  profileHref: string;
  imageUrl: string | null;
  // Their *own* dominant score — same number the leaderboard shows. We pick
  // the higher of (founderScore, investorScore) so the pill reads the same
  // way no matter which dimension this matrix is keyed off.
  displayScore: number;
};

export type MatrixResult = {
  similar: MatrixMatch[];
  complement: MatrixMatch[];
  opposite: MatrixMatch[];
};

// 5-min in-memory cache. The candidate list is moderate (one row per scored
// profile) and only shifts when new evals land or get re-scored — same
// staleness pattern as getPopulation() in credibility.ts.
type CandidateCache = {
  candidates: MatrixCandidate[];
  computedAt: number;
};
let candidateCache: CandidateCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateMatrixCandidateCache(): void {
  candidateCache = null;
}

export async function getMatrixCandidates(): Promise<MatrixCandidate[]> {
  if (candidateCache && Date.now() - candidateCache.computedAt < CACHE_TTL_MS) {
    return candidateCache.candidates;
  }

  // Same exclusions as the population query in credibility.ts: drop
  // low-signal placeholders and code-redeemed rows so the matrix matches
  // real scored profiles.
  //
  // Important: we do NOT join `users` here. A single evaluation can have
  // multiple high-confidence claim rows (one per Clerk userId — a user who
  // signs in across browsers / Clerk instances ends up with multiple rows
  // pointing at the same eval). A LEFT JOIN would multiply the eval into
  // one candidate per claim, with different (clerkUsername, clerkImageUrl)
  // → different profileHrefs → the same person appearing multiple times in
  // the matrix. Instead we load claims separately and pick ONE
  // representative per eval (see pickBestClaim below).
  const evalRows = await db
    .select({
      id: evaluations.id,
      fullName: evaluations.fullName,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      breakdown: evaluations.breakdown,
    })
    .from(evaluations)
    // SECURITY: exclude superadmin-hidden profiles so a suppressed profile's
    // identity (name/href/avatar) can't surface as a named matrix peer.
    .where(and(ne(evaluations.signalQuality, "low"), ne(evaluations.source, "code"), isNull(evaluations.hiddenAt)));

  const claimRows = await db
    .select({
      evaluationId: users.evaluationId,
      clerkUsername: users.clerkUsername,
      clerkImageUrl: users.clerkImageUrl,
    })
    .from(users)
    .where(
      and(
        isNotNull(users.evaluationId),
        // Claimed = high (owner-grade) only; a medium name-only match is not
        // the owner and must not surface as claimed on the matrix.
        eq(users.matchConfidence, "high"),
      ),
    );

  const claimByEval = pickBestClaimPerEval(claimRows);

  // Two-pass: collect raw vector points, build per-vector populations, then
  // turn each profile's raw points into percentiles using that population.
  // Same logic as buildRadar() in credibility.ts, but batched across the
  // whole eligible set in one pass.
  const founderPop = Object.fromEntries(VECTOR_KEYS.map((k) => [k, [] as number[]])) as Record<
    VectorKey,
    number[]
  >;
  const investorPop = Object.fromEntries(
    INVESTOR_VECTOR_KEYS.map((k) => [k, [] as number[]]),
  ) as Record<InvestorVectorKey, number[]>;

  const raw = evalRows.map((r) => ({
    row: r,
    founderRaw: rawVectorPoints(founderRows(r.breakdown)),
    investorRaw: rawInvestorVectorPoints(investorRows(r.breakdown)),
  }));

  for (const p of raw) {
    for (const k of VECTOR_KEYS) founderPop[k].push(p.founderRaw[k]);
    for (const k of INVESTOR_VECTOR_KEYS) investorPop[k].push(p.investorRaw[k]);
  }

  const candidates: MatrixCandidate[] = raw.map((p) => {
    const claim = claimByEval.get(p.row.id) ?? null;
    return {
      evalId: p.row.id,
      fullName: p.row.fullName,
      profileHref: profileUrlFor({
        evalId: p.row.id,
        slug: p.row.slug,
        slugKind: p.row.slugKind,
        clerkUsername: claim?.clerkUsername ?? null,
      }),
      imageUrl: claim?.clerkImageUrl ?? null,
      founderScore: p.row.founderScore,
      investorScore: p.row.investorScore,
      founderVector: VECTOR_KEYS.map((k) => percentileOf(p.founderRaw[k], founderPop[k])),
      investorVector: INVESTOR_VECTOR_KEYS.map((k) =>
        percentileOf(p.investorRaw[k], investorPop[k]),
      ),
    };
  });

  candidateCache = { candidates, computedAt: Date.now() };
  return candidates;
}

// One representative claim per eval. Multiple high-confidence claim rows
// can exist for a single eval (re-signin across Clerk instances → fresh
// users row each time). Pick the one with the nicest profile URL: prefer
// clerkUsername (gives /profile/<username>), then clerkImageUrl (so the
// avatar renders), then anything.
//
// Exported for unit-testing without a DB.
export type ClaimRowForDedup = {
  evaluationId: string | null;
  clerkUsername: string | null;
  clerkImageUrl: string | null;
};
export type BestClaim = {
  clerkUsername: string | null;
  clerkImageUrl: string | null;
};
export function pickBestClaimPerEval(
  claims: ClaimRowForDedup[],
): Map<string, BestClaim> {
  const out = new Map<string, BestClaim>();
  for (const c of claims) {
    if (!c.evaluationId) continue;
    const incoming: BestClaim = {
      clerkUsername: c.clerkUsername,
      clerkImageUrl: c.clerkImageUrl,
    };
    const existing = out.get(c.evaluationId);
    if (!existing) {
      out.set(c.evaluationId, incoming);
      continue;
    }
    const score = (b: BestClaim) =>
      (b.clerkUsername ? 2 : 0) + (b.clerkImageUrl ? 1 : 0);
    if (score(incoming) > score(existing)) {
      out.set(c.evaluationId, incoming);
    }
  }
  return out;
}

// Pure math: rank candidates against `myVector` along the chosen dimension.
// Exported separately from getMatrixCandidates so the math is unit-testable
// without standing up a DB.
export function computeMatrix(
  myEvalId: string,
  myVector: number[],
  dim: MatrixDimension,
  candidates: MatrixCandidate[],
): MatrixResult {
  // Dedupe by fullName before scoring. The matrix candidate list can contain
  // multiple eval rows for the same person (re-scores from different
  // LinkedIn URL variants, etc.). Without this step the same person can
  // place in multiple columns of the matrix UI. Picks the "best" eval per
  // person: prefers the one with a claimer image, then the one with the
  // higher dominant score. Rows with no fullName aren't grouped together —
  // each is kept as its own entry.
  const deduped = dedupeByFullName(candidates);

  const eligible = deduped
    .filter((c) => c.evalId !== myEvalId)
    .map((c) => {
      const theirVector = dim === "founder" ? c.founderVector : c.investorVector;
      return {
        candidate: c,
        theirVector,
        distance: euclideanDistance(myVector, theirVector),
        complement: complementScore(myVector, theirVector),
      };
    })
    // Exclude candidates with no signal on this dimension — their all-zero
    // vector would otherwise dominate "Most Opposite" with no real meaning.
    .filter((x) => x.theirVector.some((v) => v > 0));

  const toMatch = (x: { candidate: MatrixCandidate }): MatrixMatch => ({
    evalId: x.candidate.evalId,
    fullName: x.candidate.fullName,
    profileHref: x.candidate.profileHref,
    imageUrl: x.candidate.imageUrl,
    displayScore: Math.max(x.candidate.founderScore, x.candidate.investorScore),
  });

  const similar = [...eligible]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(toMatch);
  const complement = [...eligible]
    .sort((a, b) => b.complement - a.complement)
    .slice(0, 5)
    .map(toMatch);
  const opposite = [...eligible]
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 5)
    .map(toMatch);

  return { similar, complement, opposite };
}

// Group candidates by (lowercased trimmed) fullName, keeping one
// representative per name. "Best" = has a claimer image, then highest
// dominant score. Candidates with no fullName each stand alone (keyed by
// evalId) so two unrelated unnamed rows don't merge.
//
// Exported for unit-testing.
export function dedupeByFullName(candidates: MatrixCandidate[]): MatrixCandidate[] {
  const byName = new Map<string, MatrixCandidate>();
  for (const c of candidates) {
    const key = (c.fullName ?? "").toLowerCase().trim();
    if (!key) {
      byName.set(`__noname__${c.evalId}`, c);
      continue;
    }
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, c);
      continue;
    }
    const score = (x: MatrixCandidate) =>
      (x.imageUrl ? 1_000_000 : 0) + Math.max(x.founderScore, x.investorScore);
    if (score(c) > score(existing)) {
      byName.set(key, c);
    }
  }
  return Array.from(byName.values());
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function complementScore(mine: number[], theirs: number[]): number {
  let total = 0;
  for (let i = 0; i < mine.length; i++) {
    total += (100 - (mine[i] ?? 0)) * (theirs[i] ?? 0);
  }
  return total;
}

import { db } from "@/db";
import {
  evaluations,
  scoreItems,
  recommendationResponses,
  recommendationVisibility,
  badgeOverrides,
  users,
} from "@/db/schema";
import { and, asc, eq, desc, sql } from "drizzle-orm";
import { canonicalizeLinkedinUrl } from "@/lib/canonicalize";
import { computePercentilesAll, companyNameFromDomain } from "@/lib/leaderboard";
import { computeBadges } from "@/lib/badges";
import { profileUrlFor } from "@/lib/profile-slug";
import { getCredibilityRadars, type RadarVector } from "@/lib/credibility";
import { getPublicFamilyBadges } from "@/lib/family";
import {
  getMatrixCandidates,
  computeMatrix,
  type MatrixResult,
  type MatrixMatch,
} from "@/lib/founder-matrix";
import type { ExtractedMetrics } from "@/lib/scoring";

// PUBLIC API row. Deliberately omits the per-row `points` value — that's internal
// scoring IP. The API returns the overall/founder/investor scores + percentiles
// and each row's reason/confidence/status, but never the point contribution.
export type ScoreRow = { reason: string; confidence: number; status: string };
// A recommended focus area. `text` / `category` are null when the owner marked
// the item private — the same scrub the non-owner profile view applies. `rating`
// (and the item's position) stay visible so the shape is stable for consumers.
export type PriorityRow = {
  id: string;
  text: string | null;
  category: string | null;
  rating: number | null;
  private: boolean;
};
export type SummaryBlock = { text: string; status: string; confidence: number };
// Founder outcome/traction facts. Booleans + exit dollar values, all nullable.
// Not PII and not margin-sensitive, so safe to expose on the public payload.
export type OutcomeBlock = {
  hadIpo: boolean | null;
  hadAcquisition: boolean | null;
  isUnicorn: boolean | null;
  ipoMarketCapUsd: number | null;
  acquisitionPriceUsd: number | null;
};

// Self-set location from a high-confidence claim. Mirrors exactly what the
// profile page renders (operator/CSV-imported subject_* location is NEVER used).
export type LocationBlock = { city: string | null; region: string | null; country: string | null };

// Public investor-focus facts (all surfaced as badges on the profile). Structured
// only — the free-text `rawText` from the check-size blob is deliberately omitted.
export type InvestorBlock = {
  stageFocus: string[];
  industryFocus: string[];
  leadsRounds: boolean | null;
  checkSize: { minUsd: number | null; maxUsd: number | null } | null;
};

export type NeoBlock = { onNeo: boolean; slug: string | null };

// Both dimensions' credibility-radar axes (spider-graph), already percentile-
// ranked against the scored population, with verbose per-axis evidence. A
// dimension is null when this profile has no signal there.
export type CredibilityInput = {
  founder: RadarVector[] | null;
  investor: RadarVector[] | null;
};

// Per-dimension peer matrix. Each dimension is null when this profile has no
// signal there (mirrors the profile page's radar/matrix gating).
export type MatrixInput = {
  founder: MatrixResult | null;
  investor: MatrixResult | null;
};

export type ScorePayloadInput = {
  linkedinUrl: string;
  fullName: string | null;
  nickname: string | null;
  companyName: string | null;
  companyUrl: string | null;
  profileHref: string;
  avatarUrl: string | null;
  claimed: boolean;
  signalQuality: string;
  credibilityTitle: string | null;
  founderStatus: string | null;
  investorStatus: string | null;
  canonicalIndustries: string[];
  badges: string[];
  // Public family/pets tags (e.g. "Daughter", "Dog"), each with the leaderboard
  // filter key it links to. Names/photos/birthdates are never exposed.
  familyBadges: Array<{ label: string; filterKey: string | null }>;
  location: LocationBlock | null;
  investor: InvestorBlock;
  neo: NeoBlock;
  overall: { score: number; percentile: number };
  founder: { score: number; percentile: number };
  investorScores: { score: number; percentile: number };
  founderRows: ScoreRow[];
  investorRows: ScoreRow[];
  summary: SummaryBlock | null;
  priorities: PriorityRow[];
  credibility: CredibilityInput;
  matrix: MatrixInput;
  scoredAt: Date;
  cached: boolean;
  chargedCents: number;
  outcome: OutcomeBlock;
};

// RadarVector → public axis shape (camel axisLabel → snake axis_label).
function toAxis(v: RadarVector) {
  return {
    key: v.key,
    label: v.label,
    axis_label: v.axisLabel,
    score: v.score,
    coverage: v.coverage,
    // Evidence reasons only — no per-item point values (internal scoring IP).
    evidence: v.evidence.map((e) => ({ reason: e.reason })),
  };
}
function toRadar(vs: RadarVector[] | null) {
  return vs ? vs.map(toAxis) : null;
}

// MatrixMatch → public shape. Drops the internal evalId; keys off profile_href.
function toMatch(m: MatrixMatch) {
  return {
    full_name: m.fullName,
    profile_href: m.profileHref,
    avatar_url: m.imageUrl,
    display_score: m.displayScore,
  };
}
function toMatrix(r: MatrixResult | null) {
  return r
    ? {
        similar: r.similar.map(toMatch),
        complement: r.complement.map(toMatch),
        opposite: r.opposite.map(toMatch),
      }
    : null;
}

// Pure transform: gathered data → the public API response shape. Keeping this
// pure (no DB) makes the response contract unit-testable.
export function buildScorePayload(i: ScorePayloadInput) {
  const parts = (i.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? null;
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return {
    linkedin_url: i.linkedinUrl,
    full_name: i.fullName,
    nickname: i.nickname,
    first_name: firstName,
    last_name: lastName,
    company_name: i.companyName,
    company_url: i.companyUrl,
    profile_href: i.profileHref,
    avatar_url: i.avatarUrl,
    claimed: i.claimed,
    signal_quality: i.signalQuality,
    credibility_title: i.credibilityTitle,
    founder_status: i.founderStatus,
    investor_status: i.investorStatus,
    canonical_industries: i.canonicalIndustries,
    badges: i.badges,
    family_badges: i.familyBadges.map((b) => ({ label: b.label, filter_key: b.filterKey })),
    location: i.location,
    investor: {
      stage_focus: i.investor.stageFocus,
      industry_focus: i.investor.industryFocus,
      leads_rounds: i.investor.leadsRounds,
      check_size: i.investor.checkSize
        ? { min_usd: i.investor.checkSize.minUsd, max_usd: i.investor.checkSize.maxUsd }
        : null,
    },
    neo: { on_neo: i.neo.onNeo, slug: i.neo.slug },
    scores: {
      overall: i.overall,
      founder: i.founder,
      investor: i.investorScores,
    },
    founder_rows: i.founderRows,
    investor_rows: i.investorRows,
    what_you_likely_need: i.summary,
    current_priorities: i.priorities.map((p) => ({
      id: p.id,
      text: p.text,
      category: p.category,
      rating: p.rating,
      private: p.private,
    })),
    credibility: {
      founder: toRadar(i.credibility.founder),
      investor: toRadar(i.credibility.investor),
    },
    matrix: {
      founder: toMatrix(i.matrix.founder),
      investor: toMatrix(i.matrix.investor),
    },
    scored_at: i.scoredAt.toISOString(),
    cached: i.cached,
    outcome: {
      had_ipo: i.outcome.hadIpo,
      had_acquisition: i.outcome.hadAcquisition,
      is_unicorn: i.outcome.isUnicorn,
      ipo_market_cap_usd: i.outcome.ipoMarketCapUsd,
      acquisition_price_usd: i.outcome.acquisitionPriceUsd,
    },
    cost: {
      charged_cents: i.chargedCents,
      basis: i.chargedCents > 0 ? "measured" : "cached",
    },
  };
}

type RecsBlob = { summary?: string; items?: Array<{ id: string; text: string; category: string }> };
type ProfileBlob = {
  primaryCompanyDomain?: string | null;
  identity?: { companyName?: string | null } | null;
  mmHits?: Array<{ domain: string; rank: number }> | null;
  extractedMetrics?:
    | (Partial<ExtractedMetrics> & {
        partnerAtFirm?: string | null;
        hadIpo?: boolean | null;
        hadAcquisition?: boolean | null;
        isUnicornFounder?: boolean | null;
        ipoMarketCapUsd?: number | null;
        acquisitionPriceUsd?: number | null;
      })
    | null;
};
type CheckSizeBlob = { minUsd?: number | null; maxUsd?: number | null; rawText?: string | null } | null;

// Look up an already-scored person by LinkedIn URL and assemble the public
// payload — everything a non-owner sees on the profile page, and nothing more
// (no PII, owner-private priorities scrubbed). Returns null when the URL is
// invalid or we've never scored them. `opts` lets the paid path mark the result
// uncached + the charge.
export async function fetchScorePayload(
  rawUrl: string,
  opts?: { cached?: boolean; chargedCents?: number },
): Promise<ReturnType<typeof buildScorePayload> | null> {
  const url = canonicalizeLinkedinUrl(rawUrl);
  if (!url) return null;

  const [row] = await db
    .select({
      id: evaluations.id,
      linkedinUrl: evaluations.linkedinUrl,
      fullName: evaluations.fullName,
      score: evaluations.score,
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      signalQuality: evaluations.signalQuality,
      credibilityTitle: evaluations.credibilityTitle,
      profile: evaluations.profile,
      breakdown: evaluations.breakdown,
      recommendations: evaluations.recommendations,
      summaryStatus: evaluations.summaryStatus,
      summaryConfidence: evaluations.summaryConfidence,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
      founderStatusCol: evaluations.founderStatus,
      investorStatusCol: evaluations.investorStatus,
      canonicalIndustries: evaluations.canonicalIndustries,
      investorStageFocus: evaluations.investorStageFocus,
      investorIndustryFocus: evaluations.investorIndustryFocus,
      investorLeadsRounds: evaluations.investorLeadsRounds,
      investorCheckSize: evaluations.investorCheckSize,
      onNeo: evaluations.onNeo,
      neoSlug: evaluations.neoSlug,
      createdAt: evaluations.createdAt,
    })
    .from(evaluations)
    .where(eq(evaluations.linkedinUrl, url))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select({
      rubric: scoreItems.rubric,
      reason: scoreItems.reason,
      confidence: scoreItems.confidence,
      status: scoreItems.status,
    })
    .from(scoreItems)
    .where(eq(scoreItems.evaluationId, row.id))
    .orderBy(asc(scoreItems.sortOrder));
  const toRow = (r: (typeof items)[number]): ScoreRow => ({
    reason: r.reason, confidence: r.confidence, status: r.status,
  });
  const founderRows = items.filter((r) => r.rubric === "founder").map(toRow);
  const investorRows = items.filter((r) => r.rubric === "investor").map(toRow);

  const responses = await db
    .select({ itemId: recommendationResponses.itemId, rating: recommendationResponses.rating })
    .from(recommendationResponses)
    .where(eq(recommendationResponses.evaluationId, row.id));
  const ratingByItem = new Map(responses.map((r) => [r.itemId, r.rating]));

  // Owner-private priority items: presence of a row = private. Mirror the
  // non-owner profile view — keep the item + rating but scrub text/category.
  const privacyRows = await db
    .select({ itemId: recommendationVisibility.itemId })
    .from(recommendationVisibility)
    .where(eq(recommendationVisibility.evaluationId, row.id));
  const privateItemIds = new Set(privacyRows.map((p) => p.itemId));

  const recs = (row.recommendations as RecsBlob | null) ?? null;
  const priorities: PriorityRow[] = (recs?.items ?? []).map((it) => {
    const isPrivate = privateItemIds.has(it.id);
    return {
      id: it.id,
      text: isPrivate ? null : it.text,
      category: isPrivate ? null : it.category,
      rating: ratingByItem.get(it.id) ?? null,
      private: isPrivate,
    };
  });
  const summary: SummaryBlock | null = recs?.summary
    ? { text: recs.summary, status: row.summaryStatus, confidence: row.summaryConfidence }
    : null;

  const { founder: fP, investor: iP, combined: cP } = await computePercentilesAll({
    founder: row.founderScore,
    investor: row.investorScore,
    combined: row.score,
  });

  // Claim rows: high (owner-grade) only → `claimed`. A name-only (medium)
  // claimer is NOT the owner — they don't make the profile "claimed" and never
  // paint avatar / location / canonical username (impersonation). Mirrors
  // profile/page + leaderboard.
  const highClaims = await db
    .select({
      clerkImageUrl: users.clerkImageUrl,
      clerkUsername: users.clerkUsername,
      nickname: users.nickname,
      city: users.city,
      region: users.region,
      country: users.country,
      verifiedAt: users.verifiedAt,
    })
    .from(users)
    .where(and(eq(users.evaluationId, row.id), eq(users.matchConfidence, "high")))
    .orderBy(sql`${users.clerkImageUrl} IS NULL`, desc(users.verifiedAt));
  const claimed = highClaims.length > 0;
  const nickname = highClaims.find((c) => c.nickname?.trim())?.nickname?.trim() ?? null;
  const primaryHigh = highClaims[0] ?? null;
  const firstNonBlank = (key: "city" | "region" | "country"): string | null => {
    for (const c of highClaims) {
      const v = c[key]?.trim();
      if (v) return v;
    }
    return null;
  };
  const avatarUrl = primaryHigh?.clerkImageUrl ?? null;
  const username = primaryHigh?.clerkUsername ?? null;
  const location: LocationBlock | null = primaryHigh
    ? { city: firstNonBlank("city"), region: firstNonBlank("region"), country: firstNonBlank("country") }
    : null;

  const p = (row.profile as ProfileBlob | null) ?? null;
  const em = p?.extractedMetrics ?? null;
  // Company name: clean identity → VC firm name → capitalized primary domain.
  // Matches the leaderboard derivation so the two surfaces agree.
  const companyName =
    p?.identity?.companyName?.trim() || em?.partnerAtFirm?.trim() || companyNameFromDomain(p?.primaryCompanyDomain);
  const rawDomain = (p?.primaryCompanyDomain ?? "").trim().toLowerCase();
  const companyUrl = rawDomain ? `https://${rawDomain.replace(/^https?:\/\//, "")}` : null;

  // Badges: same derivation + same "drop rejected, ids only" rule as the
  // leaderboard payload, so a person's badges read identically on both.
  const overrides = await db
    .select({
      badgeId: badgeOverrides.badgeId,
      status: badgeOverrides.status,
      editedLabel: badgeOverrides.editedLabel,
    })
    .from(badgeOverrides)
    .where(eq(badgeOverrides.evaluationId, row.id));
  const badges = computeBadges(
    {
      isClaimed: claimed,
      extractedMetrics: em ?? null,
      mmHits: p?.mmHits ?? null,
      primaryCompanyDomain: p?.primaryCompanyDomain ?? null,
      investorStageFocus: row.investorStageFocus,
      investorIndustryFocus: row.investorIndustryFocus,
      investorLeadsRounds: row.investorLeadsRounds,
      onNeo: row.onNeo,
    },
    overrides.map((o) => ({
      badgeId: o.badgeId,
      status: o.status as "likely" | "confirmed" | "pending" | "rejected",
      editedLabel: o.editedLabel,
    })),
  )
    .filter((b) => b.status !== "rejected")
    .map((b) => b.id);

  // Credibility radar + peer matrix — same gating the profile page uses: a
  // dimension is present only when this profile scored on it AND has signal.
  const showFounder = row.founderScore > 0;
  const showInvestor = row.investorScore > 0;
  const radars = showFounder || showInvestor ? await getCredibilityRadars(row.breakdown) : null;
  let matrixFounder: MatrixResult | null = null;
  let matrixInvestor: MatrixResult | null = null;
  if (radars) {
    const candidates = await getMatrixCandidates();
    const buildMatrix = (dim: "founder" | "investor"): MatrixResult | null => {
      const vec = (dim === "founder" ? radars.founder : radars.investor).map((v) => v.score);
      return vec.some((s) => s > 0) ? computeMatrix(row.id, vec, dim, candidates) : null;
    };
    if (showFounder) matrixFounder = buildMatrix("founder");
    if (showInvestor) matrixInvestor = buildMatrix("investor");
  }

  const checkSizeBlob = (row.investorCheckSize as CheckSizeBlob) ?? null;
  const checkSize =
    checkSizeBlob && (checkSizeBlob.minUsd != null || checkSizeBlob.maxUsd != null)
      ? { minUsd: checkSizeBlob.minUsd ?? null, maxUsd: checkSizeBlob.maxUsd ?? null }
      : null;

  // Public family/pets badges (label + leaderboard filter key only).
  const familyBadges = await getPublicFamilyBadges(row.id);

  return buildScorePayload({
    linkedinUrl: row.linkedinUrl,
    fullName: row.fullName,
    nickname,
    companyName,
    companyUrl,
    profileHref: profileUrlFor({ evalId: row.id, slug: row.slug, slugKind: row.slugKind, clerkUsername: username }),
    avatarUrl,
    claimed,
    signalQuality: row.signalQuality,
    credibilityTitle: row.credibilityTitle ?? null,
    founderStatus: row.founderStatusCol ?? null,
    investorStatus: row.investorStatusCol ?? null,
    canonicalIndustries: row.canonicalIndustries ?? [],
    badges,
    familyBadges,
    location,
    investor: {
      stageFocus: row.investorStageFocus ?? [],
      industryFocus: row.investorIndustryFocus ?? [],
      leadsRounds: row.investorLeadsRounds ?? null,
      checkSize,
    },
    neo: { onNeo: row.onNeo ?? false, slug: row.neoSlug ?? null },
    overall: { score: row.score, percentile: cP.percentile },
    founder: { score: row.founderScore, percentile: fP.percentile },
    investorScores: { score: row.investorScore, percentile: iP.percentile },
    founderRows,
    investorRows,
    summary,
    priorities,
    credibility: {
      founder: showFounder && radars ? radars.founder : null,
      investor: showInvestor && radars ? radars.investor : null,
    },
    matrix: { founder: matrixFounder, investor: matrixInvestor },
    scoredAt: row.createdAt,
    cached: opts?.cached ?? true,
    chargedCents: opts?.chargedCents ?? 0,
    outcome: {
      hadIpo: em?.hadIpo ?? null,
      hadAcquisition: em?.hadAcquisition ?? null,
      isUnicorn: em?.isUnicornFounder ?? null,
      ipoMarketCapUsd: em?.ipoMarketCapUsd ?? null,
      acquisitionPriceUsd: em?.acquisitionPriceUsd ?? null,
    },
  });
}

import { z } from "zod";

// Structured numeric/categorical facts pulled out alongside the breakdown
// reasons. Powers achievement badges on /profile and /leaderboard (and
// future querying). Each field is independently nullable — Claude emits
// null when the source data doesn't support a confident value.
export const EXTRACTED_METRICS_SCHEMA = z.object({
  companiesFounded: z.number().int().min(0).nullable(),
  totalRaisedUsd: z.number().int().min(0).nullable(),
  exitCount: z.number().int().min(0).nullable(),
  hadIpo: z.boolean().nullable(),
  hadAcquisition: z.boolean().nullable(),
  employeesCount: z.number().int().min(0).nullable(),
  isUnicornFounder: z.boolean().nullable(),
  ycBatch: z.string().nullable(),
  partnerAtFirm: z.string().nullable(),
  isAngelInvestor: z.boolean().nullable(),
  totalDeployedUsd: z.number().int().min(0).nullable(),
  topGithubRepo: z.string().nullable(),
  topGithubRepoStars: z.number().int().min(0).nullable(),
  onWikipedia: z.boolean().nullable(),
  // Exit dollar values — feed the founder_exit rule. Default to null so older
  // persisted profiles (which lack these keys) still parse. ipoMarketCapUsd =
  // market cap AT IPO. currentMarketCapUsd = the company's CURRENT market cap if
  // still publicly traded (usually FAR higher than at IPO — NVIDIA ~$3.5T now vs
  // ~$6B at its 1999 IPO). The founder_exit row is awarded on the HIGHER of the
  // two. acquisitionPriceUsd = summed acquisition/purchase price across all
  // acquired companies they founded.
  ipoMarketCapUsd: z.number().int().min(0).nullable().default(null),
  currentMarketCapUsd: z.number().int().min(0).nullable().default(null),
  acquisitionPriceUsd: z.number().int().min(0).nullable().default(null),
  // Peak post-money valuation (USD) of a STILL-PRIVATE company they founded —
  // feeds the founder_valuation rule (+1 per $1M, uncapped). E.g. Apollo GraphQL
  // last raised at ~$1.5B → 1_500_000_000 → +1500. Null when no priced round /
  // valuation is known, or when the company already exited (use ipoMarketCapUsd /
  // acquisitionPriceUsd then). Default null so older persisted profiles parse.
  peakValuationUsd: z.number().int().min(0).nullable().default(null),
});

export type ExtractedMetrics = z.infer<typeof EXTRACTED_METRICS_SCHEMA>;

// Human-readable identity fields the model reads straight off the LinkedIn page
// (and corroborating sources). These are the cleanest extraction point for the
// "who is this person" data — buildIdentity() merges them with enricher payloads
// into evaluations.profile.identity. Every field is nullable with a .catch()
// default so a garbled value can never fail the whole eval (same defensive
// posture as the breakdown rows). The whole block defaults to empty so models
// mid-transition that omit it still parse.
const IDENTITY_DEFAULT = {
  companyName: null,
  jobTitle: null,
  headline: null,
  location: null,
  websiteUrl: null,
  education: [] as Array<{ institution: string; degree: string | null }>,
};
export const SCORING_IDENTITY_SCHEMA = z
  .object({
    companyName: z.string().nullable().catch(null),
    jobTitle: z.string().nullable().catch(null),
    headline: z.string().nullable().catch(null),
    location: z
      .object({
        city: z.string().nullable().catch(null),
        region: z.string().nullable().catch(null),
        country: z.string().nullable().catch(null),
      })
      .nullable()
      .catch(null),
    websiteUrl: z.string().nullable().catch(null),
    education: z
      .array(
        z.object({
          institution: z.string(),
          degree: z.string().nullable().catch(null),
        }),
      )
      .default([])
      .catch([]),
  })
  .default(IDENTITY_DEFAULT)
  .catch(IDENTITY_DEFAULT);

// Evidence tier for a breakdown row, used by DOUBLE-VERIFICATION weighting.
// Defaults to the conservative "single-source" if the model omits/garbles it.
export const VERIFICATION_TIERS = ["authoritative", "corroborated", "single-source", "self-asserted"] as const;
export type VerificationTier = (typeof VERIFICATION_TIERS)[number];
const VERIFICATION_ENUM = z.enum(VERIFICATION_TIERS).default("single-source").catch("single-source");

// Identifier for the specific rubric rule that produced a breakdown row. Most
// rules don't need one (they fall back to undefined and the default clamp). The
// few rules listed here are EXEMPT from the per-row +200 upper clamp because
// the magnitude IS the signal — capping them at +200 would erase the difference
// between $20M and $1B raises (or 50k vs 500k GitHub stars), or between a $400M
// acquisition and an $11B IPO (founder_exit).
export const RULE_IDS = ["venture_raised", "github_top_repo", "founder_exit", "founder_valuation"] as const;
export type RuleId = (typeof RULE_IDS)[number];
const RULE_ID_ENUM = z.enum(RULE_IDS).optional().catch(undefined);

export const SCORING_SCHEMA = z.object({
  // Display name extracted from the highlights (used for the leaderboard).
  // Null if no confident name could be extracted.
  fullName: z.string().nullable(),
  // Primary company domain (for identity matching via work-email).
  primaryCompanyDomain: z.string().nullable(),
  // Email explicitly attributed to the subject in any source. Null unless a
  // literal address appears (never guessed from domain heuristics).
  publicEmail: z.string().nullable(),
  // GitHub username only if a github.com/<user> link appears next to the
  // subject's name on LinkedIn or in an Exa highlight. Never guessed.
  githubUsername: z.string().nullable(),
  founderScore: z.number().int(),
  investorScore: z.number().int(),
  combinedScore: z.number().int(),
  signalQuality: z.enum(["high", "medium", "low"]),
  companyStage: z.string().nullable(),
  // Is the subject a founder right now, a past founder, or never one? See the
  // founderStatus field description below. Independent of the score. Tolerant
  // (.nullable().catch) so a missing/invalid value from the model degrades to
  // null ("not yet determined") instead of failing the ENTIRE eval parse — the
  // column is nullable and the marker handles null. Mirrors the .catch([])
  // tolerance used elsewhere in this schema.
  founderStatus: z.enum(["current", "past", "never"]).nullable().catch(null),
  // Same idea for investing activity — and tolerant for the same reason as
  // founderStatus (a missing/invalid value must not fail the whole eval).
  investorStatus: z.enum(["current", "past", "never"]).nullable().catch(null),
  // Is the subject PERSONALLY a technical builder/engineer (vs. a business/design/
  // operations founder of a technical company)? Gates the company-flagship OSS
  // bonus in eval-pipeline so a non-technical founder doesn't get huge technical
  // credit for OSS their company's engineers wrote (e.g. Brian Chesky / airbnb).
  // Tolerant: missing/invalid → null, which the gate treats as "not technical".
  technicalFounder: z.boolean().nullable().catch(null),
  investorStageFocus: z
    .array(z.enum(["idea","pre-seed","seed","series-a","series-b","series-c+","growth","public","acquired"]))
    .default([]),
  // Free-text industry / sector tags for the subject — the founder's company
  // sector(s) AND/OR an investor's focus areas. Canonicalized to the
  // industries.ts taxonomy and stored in evaluations.canonical_industries for the
  // Industries section + leaderboard filtering. Tolerant: missing/invalid → [].
  industries: z.array(z.string()).default([]).catch([]),
  // One-sentence headline describing the person, shown above the badges on every
  // profile (e.g. "4x-exited YC founder and angel investor now building Chief").
  // Null when signal is too thin to summarize. Persisted to
  // evaluations.credibility_title (preserved on re-score when a run yields none).
  credibilityTitle: z.string().nullable().default(null).catch(null),
  extractedMetrics: EXTRACTED_METRICS_SCHEMA,
  // Clean identity fields (company, role, headline, location, website, school).
  // Promoted into profile.identity by buildIdentity(); see src/lib/identity.ts.
  identity: SCORING_IDENTITY_SCHEMA,
  founderBreakdown: z.array(
    z.object({
      points: z.number().int(),
      reason: z.string(),
      // 0-100 self-assessed confidence. See CONFIDENCE HEURISTIC in the rubric.
      // .catch(50) so a single bad value (out of range, float, missing) doesn't
      // nuke the whole structured-output response — fall back to 50% per item
      // instead of failing schema validation for the entire eval. This bit us
      // when prod re-scoring rejected 15/15 evals with "response did not
      // match schema" because Claude occasionally emitted floats or null.
      confidence: z.number().int().min(0).max(100).default(50).catch(50),
      // Evidence tier — drives DOUBLE-VERIFICATION weighting of high-value rows
      // (see applyVerificationWeighting + the DOUBLE-VERIFICATION rubric section).
      verification: VERIFICATION_ENUM,
      // Citation URLs backing this row (independent third-party sources).
      sources: z.array(z.string()).default([]).catch([]),
      // Per-phrase citation mapping. Each entry pairs a specific substring of
      // `reason` (verbatim — character-exact substring match) with the URL(s)
      // backing THAT phrase. Lets the UI render targeted inline citations
      // ($84.9M → [techcrunch, crunchbase]) instead of one source list for
      // the whole row. Empty array is fine when the AI can't attribute
      // phrases — the row-level `sources` still applies. UI degrades to
      // plain text rendering if this is empty.
      citations: z
        .array(
          z.object({
            phrase: z.string(),
            sources: z.array(z.string()),
          }),
        )
        .default([])
        .catch([]),
      // Identifier for rules that should bypass the +200 row clamp (see RULE_IDS).
      // Most rules don't emit this; only "venture_raised" / "github_top_repo".
      rule: RULE_ID_ENUM,
    }),
  ),
  investorBreakdown: z.array(
    z.object({
      points: z.number().int(),
      reason: z.string(),
      confidence: z.number().int().min(0).max(100).default(50).catch(50),
      verification: VERIFICATION_ENUM,
      sources: z.array(z.string()).default([]).catch([]),
      // See founderBreakdown.citations above.
      citations: z
        .array(
          z.object({
            phrase: z.string(),
            sources: z.array(z.string()),
          }),
        )
        .default([])
        .catch([]),
      // See founderBreakdown.rule above.
      rule: RULE_ID_ENUM,
    }),
  ),
  // Confidence for the summary paragraph: how sure are we that "what this
  // person likely needs" matches reality, based on how much signal we had.
  summaryConfidence: z.number().int().min(0).max(100).default(50).catch(50),
  recommendations: z.object({
    summary: z.string(),
    items: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        category: z.enum([
          "fundraising",
          "hiring",
          "intros",
          "tactical",
          "positioning",
          "wellbeing",
        ]),
        // 0-100 confidence the priority is actually relevant to this person.
        confidence: z.number().int().min(0).max(100).default(50).catch(50),
      }),
    ),
  }),
});

export type ScoringResult = z.infer<typeof SCORING_SCHEMA>;

export type MMHit = { domain: string; rank: number };

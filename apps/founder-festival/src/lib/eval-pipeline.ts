import { generateText } from "ai";
import type { RequestGeo } from "./request-ip";
import {
  researchLinkedinProfile,
  extractCandidateDomains,
  type SearchHighlight,
} from "./exa";
import {
  SCORING_SCHEMA,
  SCORING_RUBRIC,
  buildScoringPrompt,
  validateBreakdowns,
  clampBreakdown,
  applyVerificationWeighting,
  shouldEscalate,
  isConfident,
  sanitizeCitations,
  type ScoringResult,
  type MMHit,
} from "./scoring";
import { runEnrichments, renderEnrichmentsForPrompt, type EnrichmentResult } from "./enrichers";
import { maybeTriggerBdAsync } from "./bd-async";
import { founderRows, investorRows } from "./breakdown-rows";
import {
  lookupMmRanksForDomains,
  applyEnterpriseValueCurve,
  addCompanyMmBonus,
  addCompanyGithubBonus,
  addLinkedinFollowersBonus,
  applyHnCitations,
  hnCitationsForReason,
} from "./scoring-bonuses";
// Public API preserved: hnCitationsForReason now lives in scoring-bonuses.
export { hnCitationsForReason };
import {
  buildCostFields,
  computeScoringCostUsd,
  type ScoringUsage,
  type EvalPricing,
} from "./scoring-cost";
// Public API preserved: these cost types now live in scoring-cost.
export type { ScoringUsage, EvalPricing };

// Async BrightData facts cached on the eval, keyed by dataset. Threaded into the
// enrichers so a sweep-triggered re-score folds them in.
type BdAsyncMap = Record<string, { data?: { facts: string[]; raw: unknown } } | undefined> | null;
import { canonicalizeIndustries } from "./industries";
import { groundSubjectFacts, renderGroundedFacts } from "./exa-grounding";
import { extractFullName } from "./enrichers/extract";
import { buildIdentity } from "./identity";
import { addExaUsage, type ExaUsage } from "./exa-cost";
import { db } from "@/db";
import { evaluations, recommendationResponses, scoreItems } from "@/db/schema";
import { canonicalizeLinkedinUrl } from "./canonicalize";
import { assignSlugIfMissing } from "./profile-slug";
import { classifyStatuses } from "./founder-status-classify";
import { refreshAvgCostStat } from "@/lib/app-stats";
import { recordScoringRun } from "@/lib/scoring-runs";
import { and, eq, ne, sql } from "drizzle-orm";
import {
  isSamePerson,
  isSamePersonByWebsite,
  dedupWebsiteDomain,
  personIdentityFromProfile,
} from "@/lib/identity-dedup";

export type EvalStatus = "scored" | "low-signal";
export type Breakdown = Array<{ points: number; reason: string }>;
// Confirmed account handles we found for the subject (GitHub login, HN handle,
// etc.), surfaced to the scoring UI as "Found you on GitHub: <handle>" lines.
export type FoundIdentity = { platform: string; handle: string };
export type EvalResult = {
  evaluationId: string;
  status: EvalStatus;
  combinedScore: number;
  founderScore: number;
  investorScore: number;
  founderBreakdown: Breakdown;
  investorBreakdown: Breakdown;
  foundIdentities: FoundIdentity[];
};

// Pull the confirmed account handles out of the persisted enrichment payloads
// (evaluations.profile.enrichments[].raw). GitHub is listed first by request.
function extractFoundIdentities(profile: unknown): FoundIdentity[] {
  const out: FoundIdentity[] = [];
  const enrichments =
    profile && typeof profile === "object"
      ? (profile as { enrichments?: unknown }).enrichments
      : null;
  if (!Array.isArray(enrichments)) return out;

  const rawBySource = new Map<string, Record<string, unknown>>();
  for (const e of enrichments) {
    if (e && typeof e === "object") {
      const src = (e as { source?: unknown }).source;
      const raw = (e as { raw?: unknown }).raw;
      if (typeof src === "string" && raw && typeof raw === "object") {
        rawBySource.set(src, raw as Record<string, unknown>);
      }
    }
  }
  const pick = (obj: Record<string, unknown> | undefined, key: string): string | null => {
    const v = obj?.[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const gh = rawBySource.get("github");
  const ghUser = gh && typeof gh.user === "object" ? (gh.user as Record<string, unknown>) : undefined;
  const ghLogin = pick(ghUser, "login");
  if (ghLogin) out.push({ platform: "GitHub", handle: ghLogin });

  const hn = pick(rawBySource.get("hackernews"), "handle");
  if (hn) out.push({ platform: "Hacker News", handle: hn });
  const npm = pick(rawBySource.get("npm"), "handle");
  if (npm) out.push({ platform: "npm", handle: npm });
  const hf = pick(rawBySource.get("huggingface"), "handle");
  if (hf) out.push({ platform: "Hugging Face", handle: hf });
  const so = pick(rawBySource.get("stackoverflow"), "display_name");
  if (so) out.push({ platform: "Stack Overflow", handle: so });
  const nfx = pick(rawBySource.get("nfx"), "slug");
  if (nfx) out.push({ platform: "NFX Signal", handle: nfx });

  return out;
}

// AI SDK v6 routes plain "provider/model" strings through Vercel AI Gateway
// automatically when AI_GATEWAY_API_KEY is set in the environment.
const MODEL_GATEWAY_ID = {
  opus: "anthropic/claude-opus-4-7",
  sonnet: "anthropic/claude-sonnet-4-6",
  haiku: "anthropic/claude-haiku-4-5",
} as const;
export type ScoringModel = keyof typeof MODEL_GATEWAY_ID;
const DEFAULT_MODEL: ScoringModel = "opus";

// Opus 4.7 reasoning-effort lever (providerOptions.anthropic.effort). Lower
// effort = fewer reasoning tokens (cheaper, faster) at some quality risk; the
// JSON payload size is unaffected, so savings are bounded by how much reasoning
// the scoring task actually uses. undefined = the model default (effectively
// "high"). Env-overridable for prod; the benchmark sweeps it to find the
// cheapest setting that still tracks default-effort scores.
export type ScoringEffort = "low" | "medium" | "high" | "xhigh" | "max";
const SCORING_EFFORT = process.env.SCORING_EFFORT as ScoringEffort | undefined;

// Reads cached eval by URL. Returns null if not cached.
export async function lookupCachedEval(rawUrl: string): Promise<EvalResult | null> {
  const linkedinUrl = canonicalizeLinkedinUrl(rawUrl);
  if (!linkedinUrl) return null;
  const [row] = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.linkedinUrl, linkedinUrl))
    .limit(1);
  if (!row) return null;
  return rowToResult(row);
}

// A profile is shown whenever scoring produced a positive combined score — i.e.
// we found enough to award points. This is deliberately NOT gated on
// signalQuality: Peter Cho earned 25 authoritative points from a SEC Form D
// filing yet was routed to /not-this-round because Claude rated his thin web
// footprint "low". Per the rubric, signalQuality is display-only metadata and
// never prevents scoring — so it must not hide the profile either. The genuine
// no-signal case (research short-circuit) writes score 0 and lands here as
// "low-signal" exactly as before.
export function deriveEvalStatus(combinedScore: number): EvalStatus {
  return combinedScore > 0 ? "scored" : "low-signal";
}

function rowToResult(row: typeof evaluations.$inferSelect): EvalResult {
  // Single owner for the {founder,investor}-vs-legacy-array parse (breakdown-rows).
  return {
    evaluationId: row.id,
    status: deriveEvalStatus(row.score),
    combinedScore: row.score,
    founderScore: row.founderScore,
    investorScore: row.investorScore,
    founderBreakdown: founderRows(row.breakdown),
    investorBreakdown: investorRows(row.breakdown),
    foundIdentities: extractFoundIdentities(row.profile),
  };
}


// TypeScript-shape hint sent to Claude alongside the prompt so the model
// emits the exact field names we expect. Mirrors SCORING_SCHEMA — keep in
// sync when changing either side.
const SCHEMA_HINT = `{
  fullName: string | null,
  primaryCompanyDomain: string | null,
  publicEmail: string | null,
  githubUsername: string | null,
  founderScore: number,
  investorScore: number,
  combinedScore: number,
  signalQuality: "high" | "medium" | "low",
  companyStage: string | null,
  credibilityTitle: string | null,
  extractedMetrics: {
    companiesFounded: number | null,
    totalRaisedUsd: number | null,
    exitCount: number | null,
    hadIpo: boolean | null,
    hadAcquisition: boolean | null,
    employeesCount: number | null,
    isUnicornFounder: boolean | null,
    ycBatch: string | null,
    partnerAtFirm: string | null,
    isAngelInvestor: boolean | null,
    totalDeployedUsd: number | null,
    topGithubRepo: string | null,
    topGithubRepoStars: number | null,
    onWikipedia: boolean | null
  },
  identity: {
    companyName: string | null,
    jobTitle: string | null,
    headline: string | null,
    location: { city: string | null, region: string | null, country: string | null } | null,
    websiteUrl: string | null,
    education: Array<{ institution: string, degree: string | null }>
  },
  founderBreakdown: Array<{ points: number, reason: string, confidence: number, verification: "authoritative" | "corroborated" | "single-source" | "self-asserted", sources: string[] }>,
  investorBreakdown: Array<{ points: number, reason: string, confidence: number, verification: "authoritative" | "corroborated" | "single-source" | "self-asserted", sources: string[] }>,
  summaryConfidence: number,
  recommendations: {
    summary: string,
    items: Array<{
      id: string,
      text: string,
      category: "fundraising" | "hiring" | "intros" | "tactical" | "positioning" | "wellbeing",
      confidence: number
    }>
  }
}`;

// Extract the first {...} JSON object from a model response. Handles
// markdown fences, leading prose, and trailing fence/closer artifacts.
function extractJsonObject(text: string): unknown {
  // Strip ```json ... ``` fences if present.
  let s = text.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  // Find the first balanced top-level {...}.
  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in response");
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error("Unbalanced braces in response JSON");
  return JSON.parse(s.slice(start, end + 1));
}

async function scoreWithClaude(
  linkedinUrl: string,
  searchHighlights: SearchHighlight[],
  mmHits: MMHit[],
  linkedinPageText: string,
  enrichmentBlock: string,
  model: ScoringModel,
  effort?: ScoringEffort,
): Promise<{ object: ScoringResult; usage: ScoringUsage }> {
  // We used to use generateObject() but Vercel AI Gateway's tool-call
  // translation produced double-wrapped responses (Claude's JSON ended up
  // inside a key whose name was the JSON Schema reference URL), breaking
  // Zod validation on EVERY re-score. generateText + manual JSON parse is
  // more verbose but the gateway leaves the model output untouched.
  const basePrompt = buildScoringPrompt(linkedinUrl, searchHighlights, mmHits, linkedinPageText, enrichmentBlock);
  const jsonPrompt = `${basePrompt}\n\n==== OUTPUT FORMAT ====\nReturn ONLY a single JSON object matching this TypeScript shape (no prose, no markdown fences):\n\n${SCHEMA_HINT}\n`;
  // Prompt caching: the large, static SCORING_RUBRIC is identical on every call
  // and leads the prompt (buildScoringPrompt puts it first). Mark it as a cached
  // prefix so repeat scoring calls pay ~0.1x for it instead of full input price;
  // the volatile per-subject data (guard + nonce'd envelope + schema hint)
  // follows the breakpoint and is never cached. cachedInputTokens (read below)
  // verifies the gateway actually honored cache_control — 0 means it didn't.
  const cachedPrefix = SCORING_RUBRIC;
  const volatileBody = jsonPrompt.startsWith(cachedPrefix)
    ? jsonPrompt.slice(cachedPrefix.length)
    : null;
  // The model occasionally emits invalid JSON (a trailing comma, or even a
  // literal "[...]" ellipsis placeholder — both seen on job a6c4cb1d). One
  // re-roll almost always fixes it, so try up to twice before failing the item.
  let gen: Awaited<ReturnType<typeof generateText>> | undefined;
  let object: ScoringResult | null = null;
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    gen = await generateText({
      model: MODEL_GATEWAY_ID[model],
      temperature: 0.2,
      // 4000 truncated the JSON for high-signal subjects (many breakdown rows +
      // recommendations) → parse failures, even on Opus. 8000 gives ~2x headroom;
      // still well under the non-streaming HTTP-timeout ceiling.
      maxOutputTokens: 8000,
      // Opus 4.7 reasoning-effort control (Anthropic-specific, forwarded by the
      // gateway). Omitted unless set so the default stays the model default.
      ...(effort ? { providerOptions: { anthropic: { effort } } } : {}),
      ...(volatileBody !== null
        ? {
            messages: [
              {
                role: "user" as const,
                content: [
                  {
                    type: "text" as const,
                    text: cachedPrefix,
                    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
                  },
                  { type: "text" as const, text: volatileBody },
                ],
              },
            ],
          }
        : { prompt: jsonPrompt }),
    });
    try {
      const rawObj = extractJsonObject(gen.text);
      // TEMP diagnostic: per-row citation counts in the RAW AI output vs the
      // parsed object. Lets us tell whether empty citations on prod are
      // (a) the AI emitting empty arrays, or (b) zod's .catch([]) silently
      // discarding malformed entries. Remove once citations land reliably.
      try {
        const rawF = ((rawObj as { founderBreakdown?: Array<{ citations?: unknown[]; sources?: unknown[] }> })?.founderBreakdown ?? []).map(
          (r, i) => `f${i}:s=${r.sources?.length ?? 0},c=${r.citations?.length ?? 0}`,
        );
        const rawI = ((rawObj as { investorBreakdown?: Array<{ citations?: unknown[]; sources?: unknown[] }> })?.investorBreakdown ?? []).map(
          (r, i) => `i${i}:s=${r.sources?.length ?? 0},c=${r.citations?.length ?? 0}`,
        );
        console.log(`[scoring][citation-diag] raw  ${[...rawF, ...rawI].join(" | ")}`);
        if (rawF.length > 0 || rawI.length > 0) {
          // Dump the first row's raw citations so we can see the shape the
          // AI is emitting (which may be getting silently dropped by zod).
          const sample = (rawObj as { founderBreakdown?: Array<{ citations?: unknown }> })?.founderBreakdown?.[0]?.citations;
          console.log(`[scoring][citation-diag] sample raw founderBreakdown[0].citations:`, JSON.stringify(sample));
        }
      } catch {
        /* diagnostic only */
      }
      const result = SCORING_SCHEMA.safeParse(rawObj);
      if (result.success) {
        object = result.data;
        // TEMP diagnostic: per-row citation counts AFTER parsing/validation.
        // Comparing this to the [citation-diag] raw counts above tells us
        // whether zod's .catch([]) is silently swallowing a malformed
        // citations array. Remove once citations land reliably.
        try {
          const parsedF = object.founderBreakdown.map((r, i) => `f${i}:s=${r.sources.length},c=${r.citations.length}`);
          const parsedI = object.investorBreakdown.map((r, i) => `i${i}:s=${r.sources.length},c=${r.citations.length}`);
          console.log(`[scoring][citation-diag] parsed ${[...parsedF, ...parsedI].join(" | ")}`);
        } catch {
          /* diagnostic only */
        }
        break;
      }
      lastErr = `schema mismatch (${result.error.issues.slice(0, 4).map((i) => i.path.join(".")).join(", ")})`;
    } catch (e) {
      lastErr = (e as Error)?.message ?? String(e);
    }
    console.error(`[scoring] parse failed (attempt ${attempt}/2): ${lastErr.slice(0, 200)}`);
    if (attempt === 1) console.error("[scoring] raw text (first 1500):", gen.text.slice(0, 1500));
  }
  if (!object || !gen) {
    throw new Error(`Scoring response unparseable after 2 attempts: ${lastErr.slice(0, 150)}`);
  }
  const { usage, providerMetadata } = gen;
  // AI SDK v6 usage shape: { inputTokens, outputTokens, totalTokens, cachedInputTokens? }.
  const u = (usage ?? {}) as { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
  const scoringUsage: ScoringUsage = {
    model,
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    cachedInputTokens: u.cachedInputTokens ?? 0,
    costUsd: 0,
    costSource: "estimated",
  };
  // Prefer the gateway's reported per-generation cost (the real billed amount);
  // fall back to the token×price estimate only if it's missing.
  const gw = (providerMetadata?.gateway ?? {}) as { cost?: unknown; generationId?: unknown };
  const realCost = typeof gw.cost === "string" ? Number(gw.cost) : typeof gw.cost === "number" ? gw.cost : NaN;
  if (Number.isFinite(realCost)) {
    scoringUsage.costUsd = realCost;
    scoringUsage.costSource = "gateway";
  } else {
    scoringUsage.costUsd = computeScoringCostUsd(model, scoringUsage);
    scoringUsage.costSource = "estimated";
  }
  if (typeof gw.generationId === "string") scoringUsage.generationId = gw.generationId;
  return { object, usage: scoringUsage };
}

// Research + scoring without persistence. Used by both fresh runs and
// re-scores so the pipeline stays in one place; persistence (INSERT vs.
// UPDATE) is the caller's job. `exaUsage` carries the real Exa cost incurred
// (research search/content + domain-enricher search) so it can be persisted.
export type ScoredPayload =
  | { type: "low-signal"; grounding: unknown; exaUsage: ExaUsage }
  | {
      type: "scored";
      scoring: ScoringResult;
      scoringUsage: ScoringUsage;
      mmHits: MMHit[];
      enrichments: EnrichmentResult[];
      grounding: unknown;
      exaUsage: ExaUsage;
      // Cascade signal: true when this (cheap-model) result has a high-value but
      // weakly-evidenced/low-confidence row worth re-scoring with Opus. Computed
      // pre-weighting. Ignored by persistence.
      escalate?: boolean;
    };

// The model-independent inputs for a scoring call: the Exa research, MM ranks,
// enrichments, grounded facts, and the rendered enrichment block. Produced once
// per subject by researchSubject(), then handed to scoreInputs() with whichever
// model. Splitting research from scoring lets the benchmark compare models on
// IDENTICAL inputs and lets the future cascade score cheap-then-escalate without
// re-running (expensive, variable) research. `lowSignal` short-circuits scoring.
export type ResearchInputs = {
  lowSignal: boolean;
  searchHighlights: SearchHighlight[];
  linkedinPageText: string;
  mmHits: MMHit[];
  enrichments: EnrichmentResult[];
  enrichmentBlock: string;
  grounding: unknown;
  exaUsage: ExaUsage;
};

// Run all the (model-independent) research for a subject, once. `manualHint` is an
// admin-entered name/about override for profiles no public API can read (private
// LinkedIn) — it's prepended to the LinkedIn page text as authoritative content so
// name extraction + the grounded name-search work and the low-signal short-circuit
// is avoided.
export async function researchSubject(
  linkedinUrl: string,
  manualHint?: string | null,
  bdAsync?: BdAsyncMap,
  knownFullName?: string | null,
): Promise<ResearchInputs> {
  const { searchHighlights, linkedinPageText: fetchedText, grounding, exaUsage: researchUsage } =
    await researchLinkedinProfile(linkedinUrl);
  const hint = manualHint?.trim();
  const linkedinPageText = [hint, fetchedText].filter(Boolean).join("\n\n");

  // Low-signal short-circuit: if Exa returned NOTHING. Otherwise we let
  // Claude do its job — the rubric forbids zero-scoring when any
  // founder/investor signal is present. The research search still cost money
  // even when it returned nothing, so carry its usage through.
  if (searchHighlights.length === 0 && !linkedinPageText) {
    return {
      lowSignal: true,
      searchHighlights,
      linkedinPageText: linkedinPageText ?? "",
      mmHits: [],
      enrichments: [],
      enrichmentBlock: "",
      grounding,
      exaUsage: researchUsage,
    };
  }

  const candidateDomains = extractCandidateDomains(searchHighlights);
  const linkedinHandle = (linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] ?? "").toLowerCase();

  // Parallel: MM lookup, Tier 1 enrichments, AND the Exa-grounded facts layer
  // (cited capital-raised / exits / investment-outcomes). The grounding query
  // needs a name, so derive it the same way the enrichers do.
  const subjectName = extractFullName({
    linkedinUrl,
    linkedinHandle,
    linkedinPageText: linkedinPageText ?? "",
    searchHighlights,
  });
  const [mmHits, enrichmentRun, grounded] = await Promise.all([
    lookupMmRanksForDomains(candidateDomains),
    runEnrichments({
      linkedinUrl,
      linkedinHandle,
      linkedinPageText: linkedinPageText ?? "",
      searchHighlights,
      bdAsync,
      knownFullName,
    }),
    groundSubjectFacts(subjectName),
  ]);
  const enrichments = enrichmentRun.enrichments;
  // Roll the grounding call's Exa cost into the per-eval pricing alongside the
  // research search + enrichers.
  const exaUsage = addExaUsage(addExaUsage(researchUsage, enrichmentRun.exaUsage), grounded.exaUsage);
  // Prepend the cited grounded-facts block so Claude reads it first and can mark
  // supported rows "corroborated" vs LinkedIn-only "self-asserted".
  const enrichmentBlock = [renderGroundedFacts(grounded.facts), renderEnrichmentsForPrompt(enrichments)]
    .filter(Boolean)
    .join("\n");

  return {
    lowSignal: false,
    searchHighlights,
    linkedinPageText: linkedinPageText ?? "",
    mmHits,
    enrichments,
    enrichmentBlock,
    grounding,
    exaUsage,
  };
}

// Score pre-fetched research inputs with a given model. No research, no
// persistence — pure scoring. Same deterministic post-processing as before
// (clamp → verification-weight → recompute totals).
export async function scoreInputs(
  linkedinUrl: string,
  inputs: ResearchInputs,
  model: ScoringModel,
  effort: ScoringEffort | undefined = SCORING_EFFORT,
): Promise<ScoredPayload> {
  if (inputs.lowSignal) {
    return { type: "low-signal", grounding: inputs.grounding, exaUsage: inputs.exaUsage };
  }
  const { object: scoring, usage: scoringUsage } = await scoreWithClaude(
    linkedinUrl,
    inputs.searchHighlights,
    inputs.mmHits,
    inputs.linkedinPageText,
    inputs.enrichmentBlock,
    model,
    effort,
  );
  // Stabilize founder_valuation: a priced-round private valuation is a grounded,
  // dollar-weighted magnitude signal (the row cites its sources). Pin it to
  // "authoritative" so the double-verification step doesn't randomly ×0.6 it —
  // otherwise a $1.5B founder swings between +1500 and +900 across re-scores on
  // the LLM's verification call alone.
  for (const row of scoring.founderBreakdown) {
    if (row.rule === "founder_valuation") row.verification = "authoritative";
  }
  // Curve the dollar-magnitude founder rows (valuation / exit / raise). The model
  // emits them as linear floor(usd/$1M) — which hit 1.7M for Microsoft — and this
  // deterministically rewrites them onto the square-root enterprise-value curve
  // (curvedDollarPoints) so a more valuable company is worth proportionally more
  // without the linear blow-up. Runs before clamp/weighting.
  applyEnterpriseValueCurve(scoring);
  // System-computed Majestic Million prominence bonus on the resolved company
  // domain (added before clamp/weighting so totals include it).
  await addCompanyMmBonus(scoring);
  // System-computed company-flagship OSS bonus: credits a founder for their
  // company's GitHub org OSS (which the personal-account enricher can't see).
  // Also keyed on the resolved company domain; added before clamp/weighting.
  await addCompanyGithubBonus(scoring);
  // System-computed LinkedIn follower-reach bonus (1 pt / 1,000 followers) from
  // the BrightData enricher's exact count. Added before clamp/weighting.
  addLinkedinFollowersBonus(scoring, inputs.enrichments, linkedinUrl);
  // Deep-link HN rows (karma → profile, posts → submissions, top post → the
  // post) by injecting per-phrase citations from the HN enricher's URLs.
  applyHnCitations(scoring, inputs.enrichments);
  // Defense against prompt-injection-driven point inflation: clamp every
  // breakdown item before we recompute totals. Caps are well above any
  // legitimate single-item award in the rubric (see clampBreakdown).
  scoring.founderBreakdown = clampBreakdown(scoring.founderBreakdown);
  scoring.investorBreakdown = clampBreakdown(scoring.investorBreakdown);
  // Cascade decision must be made on the clamped-but-NOT-yet-weighted breakdown
  // (weighting shrinks self-asserted high-value rows below the threshold).
  const escalate = shouldEscalate(scoring);
  // DOUBLE-VERIFICATION (no caps): down-weight HIGH-VALUE rows that aren't well
  // corroborated (self-asserted ×0.25, single-source ×0.6; authoritative /
  // corroborated unchanged). Low-value rows pass through untouched.
  scoring.founderBreakdown = applyVerificationWeighting(scoring.founderBreakdown);
  scoring.investorBreakdown = applyVerificationWeighting(scoring.investorBreakdown);
  // Always recompute totals from the (now-clamped) breakdowns. We no longer
  // trust the model's reported founderScore/investorScore/combinedScore —
  // the breakdown is the source of truth.
  scoring.founderScore = scoring.founderBreakdown.reduce((a, b) => a + b.points, 0);
  scoring.investorScore = scoring.investorBreakdown.reduce((a, b) => a + b.points, 0);
  scoring.combinedScore = scoring.founderScore + scoring.investorScore;
  // Keep validateBreakdowns around for observability even though we now always
  // recompute; it's still useful as a quick "did the model agree with itself?"
  // check that we can log if we ever want to monitor drift.
  void validateBreakdowns(scoring);

  return {
    type: "scored",
    scoring,
    scoringUsage,
    mmHits: inputs.mmHits,
    enrichments: inputs.enrichments,
    grounding: inputs.grounding,
    exaUsage: inputs.exaUsage,
    escalate,
  };
}

// MODEL CASCADE: score with the cheap default (Sonnet), then re-score with Opus
// ONLY when the cheap result trips an escalation trigger (high-value +
// weak-evidence/low-confidence row — see shouldEscalate). Most evals stop at
// Sonnet (cheaper); the uncertain high-stakes minority pay for both calls but
// get Opus-grade judgment where it changes the answer. The Opus re-score reuses
// the same inputs (no re-research) and the cached rubric.
const CASCADE_CHEAP: ScoringModel = "sonnet";
const CASCADE_ESCALATE_TO: ScoringModel = "opus";
async function scoreWithCascade(linkedinUrl: string, inputs: ResearchInputs): Promise<ScoredPayload> {
  let first: ScoredPayload | null = null;
  try {
    first = await scoreInputs(linkedinUrl, inputs, CASCADE_CHEAP);
  } catch (err) {
    // Cheap pass threw (e.g. the model returned truncated/unparseable JSON,
    // which we observed more often on Sonnet). Don't fail the eval — escalate.
    console.warn("[cascade] cheap pass failed, escalating to Opus:", err instanceof Error ? err.message : err);
  }
  // No escalation needed: cheap result is good and doesn't trip a trigger.
  if (first && first.type === "scored" && !first.escalate) return first;
  if (first && first.type === "low-signal") return first;

  const escalated = await scoreInputs(linkedinUrl, inputs, CASCADE_ESCALATE_TO);
  // Total LLM cost = cheap pass (if it ran) + escalation pass.
  if (escalated.type === "scored" && first && first.type === "scored") {
    escalated.scoringUsage.costUsd += first.scoringUsage.costUsd;
  }
  return escalated;
}

// 3-TIER CONFIDENCE LADDER: Haiku first; accept it only when it's confident
// (every row ≥ HAIKU_MIN and signalQuality not low). Otherwise hand off to
// Sonnet under the same gate (SONNET_MIN), then to Opus (terminal). Each tier
// re-scores the full profile on the same cached inputs. Target: most evals stop
// at Haiku (~$0.02), a minority climb — averaging toward ~$0.05/eval. Quality
// hinges on whether a model's self-confidence tracks accuracy (measured by
// bench-models.mjs); tighten the thresholds if cheap models are overconfident.
const TIER_HAIKU_MIN = Number(process.env.CASCADE_HAIKU_MIN) || 95;
const TIER_SONNET_MIN = Number(process.env.CASCADE_SONNET_MIN) || 85;

async function tryScore(
  linkedinUrl: string,
  inputs: ResearchInputs,
  model: ScoringModel,
): Promise<ScoredPayload | null> {
  try {
    return await scoreInputs(linkedinUrl, inputs, model);
  } catch (err) {
    console.warn(`[3tier] ${model} pass failed, escalating:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function scoreWith3TierCascade(linkedinUrl: string, inputs: ResearchInputs): Promise<ScoredPayload> {
  let cost = 0; // accumulated LLM cost across the tiers we ran
  const accept = (p: ScoredPayload): ScoredPayload => {
    if (p.type === "scored") p.scoringUsage.costUsd = cost; // total cost to reach this answer
    return p;
  };

  const haiku = await tryScore(linkedinUrl, inputs, "haiku");
  if (haiku?.type === "low-signal") return haiku;
  if (haiku?.type === "scored") {
    cost += haiku.scoringUsage.costUsd;
    if (isConfident(haiku.scoring, TIER_HAIKU_MIN)) return accept(haiku);
  }

  const sonnet = await tryScore(linkedinUrl, inputs, "sonnet");
  if (sonnet?.type === "low-signal") return sonnet;
  if (sonnet?.type === "scored") {
    cost += sonnet.scoringUsage.costUsd;
    if (isConfident(sonnet.scoring, TIER_SONNET_MIN)) return accept(sonnet);
  }

  const opus = await scoreInputs(linkedinUrl, inputs, "opus"); // terminal — let it throw if even Opus fails
  if (opus.type === "scored") {
    cost += opus.scoringUsage.costUsd;
    opus.scoringUsage.costUsd = cost;
  }
  return opus;
}

// Opt-in via env so prod stays on Opus until a cascade is validated. On the
// DEFAULT eval path (model === DEFAULT_MODEL): "3tier" → Haiku→Sonnet→Opus
// ladder; "binary"/"1" → the Sonnet→Opus trigger cascade. Admin jobs that pass
// an explicit model always get exactly that model. Unset → Opus (current prod).
const CASCADE_MODE = process.env.SCORING_CASCADE;

async function computeFreshScore(
  linkedinUrl: string,
  model: ScoringModel,
  manualHint?: string | null,
  bdAsync?: BdAsyncMap,
  knownFullName?: string | null,
): Promise<ScoredPayload> {
  const inputs = await researchSubject(linkedinUrl, manualHint, bdAsync, knownFullName);
  // Low-signal short-circuits regardless of model; explicit-model jobs bypass any cascade.
  let payload: ScoredPayload;
  if (inputs.lowSignal || model !== DEFAULT_MODEL) {
    payload = await scoreInputs(linkedinUrl, inputs, model);
  } else if (CASCADE_MODE === "3tier") {
    payload = await scoreWith3TierCascade(linkedinUrl, inputs);
  } else if (CASCADE_MODE === "binary" || CASCADE_MODE === "1") {
    payload = await scoreWithCascade(linkedinUrl, inputs);
  } else {
    payload = await scoreInputs(linkedinUrl, inputs, model);
  }
  return fillMissingFounderInvestorStatus(payload);
}

// The main scoring model sometimes OMITS founderStatus / investorStatus on very
// large outputs (e.g. Patrick Collison). The schema tolerates that (→ null), but
// a null means no marker. Backfill the missing one(s) with the cheap classifier
// from the data we just scored, so every scored profile gets a status. Best-
// effort: on any failure we leave it null (#196 + the preserve-on-null guard in
// reEvaluate keep us safe).
async function fillMissingFounderInvestorStatus(payload: ScoredPayload): Promise<ScoredPayload> {
  if (payload.type !== "scored") return payload;
  const s = payload.scoring;
  if (s.founderStatus != null && s.investorStatus != null) return payload;
  try {
    const id = (s.identity ?? {}) as { company?: string | null; role?: string | null; headline?: string | null };
    const em = s.extractedMetrics ?? {};
    const lines = [
      `Name: ${s.fullName ?? "?"}`,
      id.headline ? `Headline: ${id.headline}` : "",
      id.role || id.company ? `Current role: ${[id.role, id.company].filter(Boolean).join(" @ ")}` : "",
      em.companiesFounded != null ? `Companies founded: ${em.companiesFounded}` : "",
      em.exitCount != null ? `Exits: ${em.exitCount}` : "",
      em.partnerAtFirm ? `Partner at firm (investing): ${em.partnerAtFirm}` : "",
      em.isAngelInvestor ? `Angel investor: yes` : "",
      em.totalDeployedUsd != null ? `Capital deployed: ${em.totalDeployedUsd}` : "",
      s.founderBreakdown?.length ? `Founder evidence:\n${s.founderBreakdown.slice(0, 6).map((r) => `- ${r.reason}`).join("\n")}` : "",
      s.investorBreakdown?.length ? `Investor evidence:\n${s.investorBreakdown.slice(0, 5).map((r) => `- ${r.reason}`).join("\n")}` : "",
    ].filter(Boolean);
    const c = await classifyStatuses(lines.join("\n").slice(0, 2500));
    if (s.founderStatus == null) s.founderStatus = c.founder ?? "never";
    if (s.investorStatus == null) s.investorStatus = c.investor ?? "never";
  } catch {
    /* best-effort */
  }
  return payload;
}

// Shape the persistence layer needs. Same fields for INSERT (runEval) and
// UPDATE (reEvaluate) — only the WHERE/operation differs.
// Postgres JSONB rejects `\u0000` (NUL bytes) and lone surrogates that the
// scraped/LLM content sometimes contains. Recursively scrub strings before
// we hand the value to Drizzle. Without this we hit "unsupported Unicode
// escape sequence" on a small fraction of evals.
function sanitizeForJsonb<T>(v: T): T {
  if (v == null) return v;
  if (typeof v === "string") {
    return v
      .replace(/\u0000/g, "")
      // Lone high surrogates (no following low surrogate)
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
      // Lone low surrogates (no preceding high surrogate)
      .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "") as unknown as T;
  }
  if (Array.isArray(v)) return v.map(sanitizeForJsonb) as unknown as T;
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = sanitizeForJsonb(val);
    }
    return out as T;
  }
  return v;
}

// Project the structured investor facets we want queryable on the row (used by
// badges + filters) out of the Neo and NFX enrichment payloads, plus Claude's
// own investorStageFocus as fallback. Conflicts: union-and-dedupe for arrays,
// Neo > NFX for boolean facts (Neo is human-edited, NFX is community-edited).
// See PRD/neo-investor-enricher.md.
type NeoFacets = {
  slug?: string;
  stages?: string[];
  industries?: string[];
  leadsRounds?: boolean | null;
  checkSize?: { minUsd?: number; maxUsd?: number; rawText: string } | null;
};
type NfxFacets = {
  stages?: string[];
  verticals?: string[];
  leads_rounds?: boolean | null;
};
function uniqueStrings(items: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    if (!s) continue;
    const trimmed = s.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}
function investorFacets(
  enrichments: EnrichmentResult[],
  fallbackStageFocus: string[],
): {
  investorStageFocus: string[];
  investorIndustryFocus: string[];
  investorLeadsRounds: boolean | null;
  investorCheckSize: { minUsd?: number; maxUsd?: number; rawText: string } | null;
  onNeo: boolean;
  neoSlug: string | null;
} {
  const neoRaw = enrichments.find((e) => e.source === "neo")?.raw as NeoFacets | undefined;
  const nfxRaw = enrichments.find((e) => e.source === "nfx")?.raw as NfxFacets | undefined;

  const investorStageFocus = uniqueStrings([
    ...(neoRaw?.stages ?? []),
    ...(nfxRaw?.stages ?? []),
    ...fallbackStageFocus,
  ]);
  const investorIndustryFocus = uniqueStrings([
    ...(neoRaw?.industries ?? []),
    ...(nfxRaw?.verticals ?? []),
  ]);
  const investorLeadsRounds = neoRaw?.leadsRounds ?? nfxRaw?.leads_rounds ?? null;
  const investorCheckSize = neoRaw?.checkSize ?? null;
  const onNeo = !!neoRaw && !!neoRaw.slug;
  const neoSlug = onNeo ? (neoRaw?.slug ?? null) : null;

  return {
    investorStageFocus,
    investorIndustryFocus,
    investorLeadsRounds,
    investorCheckSize,
    onNeo,
    neoSlug,
  };
}

// The stable LinkedIn numeric id from the BrightData enricher raw — the strongest
// dedup key (identical across vanity-URL changes). Null when BrightData didn't run.
function extractLinkedinNumId(enrichments: EnrichmentResult[]): string | null {
  const bd = enrichments.find((e) => e.source === "brightdata");
  const v = (bd?.raw as { linkedin_num_id?: unknown } | undefined)?.linkedin_num_id;
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function payloadToWriteFields(payload: ScoredPayload, linkedinUrl: string) {
  if (payload.type === "low-signal") {
    return {
      linkedinUrl,
      fullName: null as string | null,
      score: 0,
      founderScore: 0,
      investorScore: 0,
      signalQuality: "low" as const,
      // No public data → no evidence of founding. Shows the red "Not (yet!) a
      // founder" marker until a re-score or claim says otherwise.
      founderStatus: "never" as const,
      investorStatus: "never" as const,
      breakdown: { founder: [], investor: [] },
      profile: null,
      companyStage: null as string | null,
      credibilityTitle: null as string | null,
      linkedinNumId: null as string | null,
      investorStageFocus: [] as string[],
      investorIndustryFocus: [] as string[],
      canonicalIndustries: [] as string[],
      investorLeadsRounds: null as boolean | null,
      investorCheckSize: null as { minUsd?: number; maxUsd?: number; rawText: string } | null,
      onNeo: null as boolean | null,
      neoSlug: null as string | null,
      recommendations: null,
      summarySource: "system" as const,
      summaryStatus: "likely" as const,
      summaryConfidence: 0,
      exaGrounding: payload.grounding,
      // Low-signal evals make no Claude call but still incur the research Exa
      // cost — record it so the dashboard total is truthful.
      ...buildCostFields(null, payload.exaUsage),
    };
  }
  const { scoring, scoringUsage, mmHits, enrichments, grounding, exaUsage } = payload;
  const facets = investorFacets(enrichments, scoring.investorStageFocus ?? []);
  // `onNeo` here is *known* — we checked. Distinct from the tri-state null
  // (which means we never checked). For low-signal evals the field stays null
  // (above); for scored evals we land on the true/false the enricher returned.
  const onNeoFinal: boolean = facets.onNeo;
  return {
    linkedinUrl,
    fullName: scoring.fullName ?? null,
    score: scoring.combinedScore,
    founderScore: scoring.founderScore,
    investorScore: scoring.investorScore,
    signalQuality: scoring.signalQuality,
    founderStatus: scoring.founderStatus,
    investorStatus: scoring.investorStatus,
    breakdown: sanitizeForJsonb({
      founder: scoring.founderBreakdown,
      investor: scoring.investorBreakdown,
    }),
    profile: sanitizeForJsonb({
      fullName: scoring.fullName,
      primaryCompanyDomain: scoring.primaryCompanyDomain,
      publicEmail: scoring.publicEmail,
      githubUsername: scoring.githubUsername,
      mmHits,
      // Structured numeric/categorical facts pulled out of the same
      // research, used to render achievement badges. See
      // EXTRACTED_METRICS_SCHEMA in scoring.ts.
      extractedMetrics: scoring.extractedMetrics,
      // Clean identity block — merges the model's identity output with enricher
      // raw payloads + deterministic fallbacks. See src/lib/identity.ts.
      identity: buildIdentity({
        llm: scoring.identity,
        enrichments,
        extractedMetrics: scoring.extractedMetrics,
        primaryCompanyDomain: scoring.primaryCompanyDomain,
      }),
      enrichments: enrichments.map((e) => ({
        source: e.source,
        fact_count: e.facts.length,
        citation_count: e.citations.length,
        raw: e.raw,
      })),
      // Actual token usage from the scoring call. Lets /admin/profiles tune
      // its per-eval cost estimate against real data instead of the
      // hardcoded constants in COST_PER_EVAL_CENTS.
      usage: scoringUsage,
    }),
    companyStage: scoring.companyStage,
    credibilityTitle: scoring.credibilityTitle ?? null,
    linkedinNumId: extractLinkedinNumId(enrichments),
    investorStageFocus: facets.investorStageFocus,
    investorIndustryFocus: facets.investorIndustryFocus,
    // Canonical industry slugs for BOTH dimensions: the investor focus areas +
    // the founder/company sectors the scorer inferred, normalized + deduped via
    // the industries.ts taxonomy. Powers the Industries section + leaderboard
    // industry filter/counts (text[] column).
    canonicalIndustries: canonicalizeIndustries([
      ...facets.investorIndustryFocus,
      ...(scoring.industries ?? []),
    ]),
    investorLeadsRounds: facets.investorLeadsRounds,
    investorCheckSize: facets.investorCheckSize,
    onNeo: onNeoFinal,
    neoSlug: facets.neoSlug,
    recommendations: sanitizeForJsonb(scoring.recommendations),
    summarySource: "system" as const,
    summaryStatus: "likely" as const,
    summaryConfidence: scoring.summaryConfidence,
    exaGrounding: sanitizeForJsonb(grounding),
    // Real cost of this eval: Claude (scoringUsage) + Exa (research + domain
    // enricher). Written on every fresh run and re-score, so the previously
    // silent /api/eval and /api/rescore paths are now tracked automatically.
    ...buildCostFields(scoringUsage, exaUsage),
  };
}

// Persist per-item rows to score_items. Called after the evaluations row is
// written so we can FK to it. On re-score, we delete the existing system
// rows (status=likely) for this eval first; user-added rows and user-
// modified system rows survive via their source/status.
async function persistScoreItems(
  evaluationId: string,
  payload: ScoredPayload,
): Promise<void> {
  if (payload.type === "low-signal") {
    await db
      .delete(scoreItems)
      .where(
        and(eq(scoreItems.evaluationId, evaluationId), eq(scoreItems.source, "system")),
      );
    return;
  }
  const { scoring } = payload;
  await db
    .delete(scoreItems)
    .where(
      and(
        eq(scoreItems.evaluationId, evaluationId),
        eq(scoreItems.source, "system"),
        eq(scoreItems.status, "likely"),
      ),
    );
  const rows = [
    ...scoring.founderBreakdown.map((row, i) => ({
      evaluationId,
      rubric: "founder" as const,
      reason: row.reason,
      points: row.points,
      source: "system" as const,
      status: "likely" as const,
      confidence: row.confidence ?? 50,
      sortOrder: i,
      // Defensive filter: drop any AI-emitted phrase that doesn't appear in
      // the reason text (hallucination guard). Persisted citations are
      // always renderable downstream.
      citations: sanitizeCitations(row.reason, row.citations ?? []),
    })),
    ...scoring.investorBreakdown.map((row, i) => ({
      evaluationId,
      rubric: "investor" as const,
      reason: row.reason,
      points: row.points,
      source: "system" as const,
      status: "likely" as const,
      confidence: row.confidence ?? 50,
      sortOrder: i,
      citations: sanitizeCitations(row.reason, row.citations ?? []),
    })),
  ];
  if (rows.length === 0) return;
  await db.insert(scoreItems).values(rows);
}

// `requester` is set only for individual user-initiated scoring (/api/eval,
// /api/rescore). The bulk cron leaves it undefined, so bulk-job evals keep a
// null request_ip and don't appear in the /admin/profiles view.
export type RunEvalOptions = { model?: ScoringModel; requester?: RequestGeo | null };

function requesterFields(requester?: RequestGeo | null) {
  if (!requester) return {};
  return {
    requestIp: requester.ip,
    requestCity: requester.city,
    requestRegion: requester.region,
    requestCountry: requester.country,
  };
}

export async function runEval(
  rawUrl: string,
  source: "url" | "code" = "url",
  opts: RunEvalOptions = {},
): Promise<EvalResult> {
  const linkedinUrl = canonicalizeLinkedinUrl(rawUrl);
  if (!linkedinUrl) throw new Error("Invalid LinkedIn URL");

  const cached = await lookupCachedEval(linkedinUrl);
  if (cached) return cached;

  const model = opts.model ?? DEFAULT_MODEL;
  const payload = await computeFreshScore(linkedinUrl, model);
  const fields = payloadToWriteFields(payload, linkedinUrl);

  // Identity-based dedup: the URL key above only catches the SAME LinkedIn URL.
  // The same person can arrive via a different LinkedIn URL (the max-stoiber /
  // mxstbr bug). If this freshly-scored person's GitHub username already belongs
  // to a profile under a DIFFERENT URL — and name + website/company corroborate
  // (isSamePerson) — return that existing profile instead of creating a twin.
  const newIdentity = personIdentityFromProfile(
    fields.fullName,
    (fields.profile as { identity?: unknown } | null)?.identity,
  );
  if (newIdentity.githubUsername) {
    const sameGithub = await db
      .select()
      .from(evaluations)
      .where(
        and(
          sql`lower(${evaluations.profile}->'identity'->'github'->>'username') = ${newIdentity.githubUsername}`,
          ne(evaluations.linkedinUrl, linkedinUrl),
        ),
      );
    const twin = sameGithub.find((ex) =>
      isSamePerson(
        newIdentity,
        personIdentityFromProfile(ex.fullName, (ex.profile as { identity?: unknown } | null)?.identity),
      ),
    );
    if (twin) return rowToResult(twin);
  }

  // GitHub-less identity dedup: a FOUNDER with no resolved GitHub arriving via a
  // second LinkedIn URL (a custom vanity vs LinkedIn's default — e.g.
  // /in/ojuwaifo vs /in/joshua-uwaifo-9239989a) was invisible to the GitHub key
  // above and got a "-2" twin (the Joshua Uwaifo case). Match instead on NAME +
  // the SAME dedicated (non-generic) website. We fetch candidates by website
  // domain, then confirm name + exact website with isSamePersonByWebsite.
  const newDomain = dedupWebsiteDomain(newIdentity.website);
  if (newDomain) {
    const sameSite = await db
      .select()
      .from(evaluations)
      .where(
        and(
          sql`lower(${evaluations.profile}->'identity'->>'websiteUrl') LIKE ${`%${newDomain}%`}`,
          ne(evaluations.linkedinUrl, linkedinUrl),
        ),
      );
    const twin = sameSite.find((ex) =>
      isSamePersonByWebsite(
        newIdentity,
        personIdentityFromProfile(ex.fullName, (ex.profile as { identity?: unknown } | null)?.identity),
      ),
    );
    if (twin) return rowToResult(twin);
  }

  // STRONGEST dedup key: the LinkedIn numeric id (from BrightData) is stable across
  // vanity-URL changes, so two evals sharing it are the SAME person — even with no
  // GitHub and no shared website. Catches the Joshua Uwaifo class directly.
  if (fields.linkedinNumId) {
    const [twin] = await db
      .select()
      .from(evaluations)
      .where(and(eq(evaluations.linkedinNumId, fields.linkedinNumId), ne(evaluations.linkedinUrl, linkedinUrl)))
      .limit(1);
    if (twin) return rowToResult(twin);
  }

  // Idempotent on linkedin_url: if a concurrent worker inserted this URL first
  // (the race that used to throw a unique-constraint violation and mark the
  // bulk-job item "failed"), DON'T error — return the winner's evaluation. We
  // only persist score_items / slug for the row WE inserted.
  const inserted = await db
    .insert(evaluations)
    .values({ ...fields, source, ...requesterFields(opts.requester) })
    .onConflictDoNothing({ target: evaluations.linkedinUrl })
    .returning();
  const row = inserted[0];
  if (!row) {
    const winner = await lookupCachedEval(linkedinUrl);
    if (winner) return winner;
    throw new Error(`eval insert conflicted on ${linkedinUrl} but no existing row found`);
  }
  await persistScoreItems(row.id, payload);
  // Append an immutable history row. Best-effort: a history-write failure must
  // never fail a paid score (same contract as refreshAvgCostStat below).
  await recordScoringRun(row, model).catch(() => {});
  // Assign the vanity slug (e.g. "daniel-ruben-odio" + kind "founder") so
  // the row is reachable at /profile/founder/daniel-ruben-odio. Idempotent
  // and stable across re-scores per profile-slug.ts.
  await assignSlugIfMissing({
    evalId: row.id,
    fullName: row.fullName,
    linkedinUrl,
    founderScore: row.founderScore,
    investorScore: row.investorScore,
  });
  // Keep the stored average cost current (best-effort; never fail a score on it).
  await refreshAvgCostStat().catch(() => {});
  // Queue async BrightData enrichment for this profile (Crunchbase company/person,
  // LinkedIn company, …); the sweep cron downloads + folds it in on a later
  // re-score. Best-effort, non-blocking.
  await maybeTriggerBdAsync(row);
  return rowToResult(row);
}

export async function reEvaluate(
  evaluationId: string,
  opts: RunEvalOptions = {},
): Promise<EvalResult> {
  const [existing] = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  if (!existing) throw new Error("Evaluation not found");
  if (existing.source === "code") {
    throw new Error("Code-redeemed evaluations cannot be re-scored");
  }

  const linkedinUrl = canonicalizeLinkedinUrl(existing.linkedinUrl);
  if (!linkedinUrl) throw new Error("Invalid LinkedIn URL on existing row");

  // UPDATE in place rather than DELETE + INSERT. Preserves the row's id so
  // FK references in `users.evaluation_id` and
  // `recommendation_responses.evaluation_id` survive — and the user's claim
  // + rating history isn't blown away on every re-score.
  const model = opts.model ?? DEFAULT_MODEL;
  // Admin-entered manual hint (for private/unreadable profiles) seeds the research.
  // Cached async BrightData facts (folded in by the sweep) feed the per-dataset
  // enrichers so a sweep-triggered re-score picks them up.
  const payload = await computeFreshScore(
    linkedinUrl,
    model,
    existing.manualProfileHint,
    existing.bdAsync,
    // The row's legal name from a prior scoring (e.g. "Daniel Rubén Odio"), so the
    // patents enricher isn't stuck with a vanity LinkedIn handle ("DROdio").
    existing.fullName,
  );
  const fields = payloadToWriteFields(payload, linkedinUrl);
  // Preserve a previously-known founder/investor status when this re-score's
  // model didn't return one. The fields are nullable (a missing value must not
  // fail the eval — see SCORING_SCHEMA); a null here means "unknown this run",
  // which should NOT wipe a status we already have (e.g. from the backfill).
  const { founderStatus, investorStatus, canonicalIndustries, credibilityTitle, linkedinNumId, ...rest } = fields;
  const statusUpdate = {
    ...(founderStatus != null ? { founderStatus } : {}),
    ...(investorStatus != null ? { investorStatus } : {}),
  };
  // Same preserve-on-empty rule for industries: a re-score whose LLM run inferred
  // NO industries (the field is optional; output varies run-to-run, and a thinner
  // re-fetched LinkedIn page can yield none) must NOT wipe a populated set — that
  // dropped the Industries badges on existing profiles. Only overwrite when this
  // run actually produced industries.
  const industriesUpdate =
    Array.isArray(canonicalIndustries) && canonicalIndustries.length > 0
      ? { canonicalIndustries }
      : {};
  // Likewise preserve the credibility title when a run produced none (null), so a
  // thin re-score doesn't blank a good headline.
  const titleUpdate =
    typeof credibilityTitle === "string" && credibilityTitle.trim().length > 0
      ? { credibilityTitle: credibilityTitle.trim() }
      : {};
  // Preserve the stable LinkedIn numeric id when a run didn't capture it (e.g.
  // BrightData timed out) — it never changes, so don't blank it.
  const numIdUpdate = linkedinNumId ? { linkedinNumId } : {};
  // Preserve the EXISTING recommendations (and thus their item ids) when the
  // owner has already rated them. Every re-score mints fresh recommendation item
  // ids; overwriting would orphan the owner's recommendation_responses (their
  // IRL-event answers), making them render on the wrong rows (the /samuel-odio
  // bug). If they've rated the current items, keep those items verbatim so the
  // ratings stay attached; otherwise take this run's fresh recommendations.
  const existingRecItems = ((existing.recommendations as { items?: Array<{ id: string }> } | null)?.items) ?? [];
  let recommendationsUpdate: { recommendations?: typeof existing.recommendations } = {};
  if (existingRecItems.length > 0) {
    const ratedRows = await db
      .select({ itemId: recommendationResponses.itemId })
      .from(recommendationResponses)
      .where(eq(recommendationResponses.evaluationId, evaluationId));
    const ratedIds = new Set(ratedRows.map((r) => r.itemId));
    if (existingRecItems.some((it) => ratedIds.has(it.id))) {
      recommendationsUpdate = { recommendations: existing.recommendations };
    }
  }
  const [row] = await db
    .update(evaluations)
    .set({
      ...rest,
      ...statusUpdate,
      ...industriesUpdate,
      ...titleUpdate,
      ...numIdUpdate,
      ...recommendationsUpdate,
      updatedAt: new Date(),
      ...requesterFields(opts.requester),
    })
    .where(eq(evaluations.id, evaluationId))
    .returning();
  await persistScoreItems(row!.id, payload);
  // Append an immutable history row for this re-score. Best-effort (see runEval).
  await recordScoringRun(row!, model).catch(() => {});
  // No-op when the row already has a slug (assign-once semantics).
  await assignSlugIfMissing({
    evalId: row!.id,
    fullName: row!.fullName,
    linkedinUrl,
    founderScore: row!.founderScore,
    investorScore: row!.investorScore,
  });
  // Keep the stored average cost current (best-effort; never fail a score on it).
  await refreshAvgCostStat().catch(() => {});
  // Queue async BrightData datasets that still need fetching (resolved ones are
  // skipped — including terminal-empty markers — so this never loops with the
  // sweep's re-score; a newly-cached dataset can unlock a chained one). Best-effort.
  await maybeTriggerBdAsync(row!);
  return rowToResult(row!);
}

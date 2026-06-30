// Connect-mode INFO-EXTRACTION pass.
//
// When CONNECT_MODE is ON the eval pipeline SKIPS the numeric Claude scoring
// cascade (scoreWithClaude) and runs this lightweight, cheaper Claude pass
// instead. It reuses the SAME AI-Gateway plumbing (generateText + the manual
// JSON extract used by scoring) and the SAME identity/recommendations machinery
// — but produces NO founder/investor points or scores. The output is an "info
// profile": identity, a short neutral bio, expertise/topic tags, and an "areas
// of expertise / how they can help" list (framed as what the PERSON offers, NOT
// advice TO them).
//
// It returns a ScoringResult-shaped object so the existing payloadToWriteFields
// persistence works unchanged: all score fields are 0/empty, statuses null, and
// the identity + recommendations + industries fields carry the extracted info.
// payloadToWriteFields already persists score=0 / breakdown=[] / etc., and the
// profile UI hides those when in connect mode.

import { generateText } from "ai";
import type { SearchHighlight } from "./exa";
import {
  SCORING_SCHEMA,
  type ScoringResult,
  type MMHit,
} from "./scoring";
import type { ScoringUsage } from "./scoring-cost";

// The TypeScript shape we ask Claude to emit. Deliberately SMALL — no points,
// no breakdowns, no verification tiers. Just the info we surface per person.
const INFO_SCHEMA_HINT = `{
  fullName: string | null,
  headline: string | null,              // short role/identity line, e.g. "Pediatric nurse and OHS parent"
  currentRole: string | null,           // current job title
  currentCompany: string | null,        // current company / org / school
  primaryCompanyDomain: string | null,  // their company/personal website domain, if any
  publicEmail: string | null,           // only if a literal address appears in the data; never guessed
  githubUsername: string | null,        // only if a github.com/<user> link appears; never guessed
  location: { city: string | null, region: string | null, country: string | null } | null,
  education: Array<{ institution: string, degree: string | null }>,
  bio: string | null,                    // 2-4 sentence NEUTRAL narrative bio. Warm, factual, NOT competitive. No scores/rankings.
  expertiseTags: string[],               // 3-8 short topic/expertise tags (e.g. "biotech", "early-childhood-education", "react")
  howTheyCanHelp: Array<{
    text: string,                        // one concrete area of expertise / way this person can help others
    category: "expertise" | "mentorship" | "intros" | "industry" | "community" | "other"
  }>
}`;

// Lightweight system/user prompt. No rubric, no scoring instructions — we want
// info aggregation, not judgment. Framed for a Stanford OHS community connector.
function buildInfoPrompt(
  linkedinUrl: string,
  searchHighlights: SearchHighlight[],
  linkedinPageText: string,
  enrichmentBlock: string,
): string {
  const highlights = searchHighlights
    .slice(0, 10)
    .map((h, i) => `[${i + 1}] ${h.title ?? ""}\n${(h.highlights ?? []).join("\n")}\n(${h.url ?? ""})`)
    .join("\n\n");
  return [
    "You are building a warm, factual INFO profile for a Stanford OHS community",
    "connector (parents ↔ students ↔ alumni ↔ community). This is NOT a ranking",
    "or scoring task. Do NOT judge, score, or rank the person. Aggregate the",
    "available information into a neutral, helpful profile so others in the",
    "community can find and connect with them.",
    "",
    "Only state facts supported by the data below. Never invent details. If a",
    "field is unknown, use null (or an empty array). Frame 'how they can help' as",
    "what THIS PERSON offers others (their expertise / what they can advise on /",
    "who they can introduce) — never as advice directed AT them.",
    "",
    `SUBJECT LINKEDIN URL: ${linkedinUrl}`,
    "",
    linkedinPageText ? `LINKEDIN / PROVIDED TEXT:\n${linkedinPageText}` : "",
    "",
    highlights ? `WEB SEARCH HIGHLIGHTS:\n${highlights}` : "",
    "",
    enrichmentBlock,
    "",
    "==== OUTPUT FORMAT ====",
    "Return ONLY a single JSON object matching this TypeScript shape (no prose,",
    "no markdown fences):",
    "",
    INFO_SCHEMA_HINT,
  ]
    .filter(Boolean)
    .join("\n");
}

// Extract the first balanced {...} JSON object from a model response. Mirrors
// extractJsonObject in eval-pipeline (kept local so this module is standalone
// and independently testable). Handles markdown fences + leading prose.
export function extractFirstJsonObject(text: string): unknown {
  let s = text.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
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

// The raw info object Claude emits (pre-normalization). All fields optional /
// tolerant — a garbled value should degrade, never throw.
type RawInfo = {
  fullName?: unknown;
  headline?: unknown;
  currentRole?: unknown;
  currentCompany?: unknown;
  primaryCompanyDomain?: unknown;
  publicEmail?: unknown;
  githubUsername?: unknown;
  location?: unknown;
  education?: unknown;
  bio?: unknown;
  expertiseTags?: unknown;
  howTheyCanHelp?: unknown;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

const HELP_CATEGORIES = ["expertise", "mentorship", "intros", "industry", "community", "other"] as const;
type HelpCategory = (typeof HELP_CATEGORIES)[number];
function helpCategory(v: unknown): HelpCategory {
  return (HELP_CATEGORIES as readonly string[]).includes(v as string) ? (v as HelpCategory) : "other";
}

// Map the small info object onto a full ScoringResult shape with ALL scoring
// fields zeroed. Reuses the existing persistence path (payloadToWriteFields)
// which already writes score=0 / breakdown=[] / statuses null for these.
//
// Mapping rationale (so the existing profile + directory UI light up cleanly):
//   - bio              → credibilityTitle (the profile's one-line/short narrative slot)
//   - expertiseTags    → industries (canonicalized + rendered as plain "Industries" tags — no points)
//   - howTheyCanHelp   → recommendations (reframed as the person's expertise/offer)
//   - identity fields  → SCORING_SCHEMA.identity (rendered by the identity header)
// Score fields stay 0; founderStatus/investorStatus null (no markers).
export function infoToScoringResult(raw: RawInfo): ScoringResult {
  const headline = str(raw.headline);
  const role = str(raw.currentRole);
  const company = str(raw.currentCompany);
  const locIn = raw.location && typeof raw.location === "object" ? (raw.location as Record<string, unknown>) : null;
  const location = locIn
    ? { city: str(locIn.city), region: str(locIn.region), country: str(locIn.country) }
    : null;
  const education = Array.isArray(raw.education)
    ? raw.education
        .map((e) => {
          const o = e && typeof e === "object" ? (e as Record<string, unknown>) : null;
          const institution = str(o?.institution);
          return institution ? { institution, degree: str(o?.degree) } : null;
        })
        .filter((x): x is { institution: string; degree: string | null } => x !== null)
    : [];
  const tags = strArray(raw.expertiseTags);
  const helpItems = Array.isArray(raw.howTheyCanHelp)
    ? raw.howTheyCanHelp
        .map((h, i) => {
          const o = h && typeof h === "object" ? (h as Record<string, unknown>) : null;
          const text = str(o?.text);
          return text ? { id: `help-${i}`, text, category: mapHelpToRecCategory(helpCategory(o?.category)), confidence: 50 } : null;
        })
        .filter((x): x is { id: string; text: string; category: ReturnType<typeof mapHelpToRecCategory>; confidence: number } => x !== null)
    : [];

  // Build a ScoringResult with zeroed scores. We let SCORING_SCHEMA.parse fill
  // the defensive defaults for any field we don't set so the type stays exact.
  const obj = {
    fullName: str(raw.fullName),
    primaryCompanyDomain: str(raw.primaryCompanyDomain),
    publicEmail: str(raw.publicEmail),
    githubUsername: str(raw.githubUsername),
    founderScore: 0,
    investorScore: 0,
    combinedScore: 0,
    signalQuality: "medium" as const,
    companyStage: null,
    // No competitive markers in connect mode.
    founderStatus: null,
    investorStatus: null,
    technicalFounder: null,
    investorStageFocus: [],
    // Expertise/topic tags ride the existing `industries` field — canonicalized
    // by the pipeline and rendered as plain "Industries" tags (no points).
    industries: tags,
    // Short neutral narrative bio lives in the credibilityTitle slot (the
    // profile's headline/summary line).
    credibilityTitle: str(raw.bio) ?? headline,
    // No metrics are extracted in connect mode (no scoring) — emit the schema's
    // all-null shape so SCORING_SCHEMA.parse passes (these fields are nullable
    // but not defaulted). EXTRACTED_METRICS_SCHEMA's own .default(null) fields
    // are filled by the parse.
    extractedMetrics: {
      companiesFounded: null,
      totalRaisedUsd: null,
      exitCount: null,
      hadIpo: null,
      hadAcquisition: null,
      employeesCount: null,
      isUnicornFounder: null,
      ycBatch: null,
      partnerAtFirm: null,
      isAngelInvestor: null,
      totalDeployedUsd: null,
      topGithubRepo: null,
      topGithubRepoStars: null,
      onWikipedia: null,
    },
    identity: {
      companyName: company,
      jobTitle: role,
      headline,
      location,
      websiteUrl: null,
      education,
    },
    founderBreakdown: [],
    investorBreakdown: [],
    summaryConfidence: 0,
    // "How they can help / areas of expertise" reuses the recommendations slot,
    // reframed as the person's offer. The profile renders these under an
    // "Areas of expertise / how they can help" heading in connect mode.
    recommendations: {
      summary:
        str(raw.bio) ??
        [role, company].filter(Boolean).join(" @ ") ??
        "",
      items: helpItems,
    },
  };
  // Parse through the real schema so defaults/catches apply and the type is exact.
  return SCORING_SCHEMA.parse(obj);
}

// The recommendations.category enum is founder-centric; map the connect-mode
// "how they can help" categories onto the closest existing value so we don't
// have to widen the persisted schema (API stability — out of scope here).
function mapHelpToRecCategory(
  c: HelpCategory,
): "fundraising" | "hiring" | "intros" | "tactical" | "positioning" | "wellbeing" {
  switch (c) {
    case "intros":
      return "intros";
    case "mentorship":
      return "positioning";
    case "community":
      return "wellbeing";
    case "industry":
    case "expertise":
    case "other":
    default:
      return "tactical";
  }
}

// Run the connect-mode info-extraction Claude pass. Returns a ScoringResult
// (scores zeroed) plus token usage, so scoreInputs can build the same
// ScoredPayload shape. `gatewayModelId` is the resolved gateway model string
// (e.g. MODEL_GATEWAY_ID["haiku"]) — passed in so this module doesn't duplicate
// the model map. On unparseable output we retry once, then fall back to a
// data-only result (no LLM bio/tags) rather than failing the eval.
export async function extractInfoProfile(args: {
  linkedinUrl: string;
  searchHighlights: SearchHighlight[];
  linkedinPageText: string;
  // The already-rendered grounded-facts + ok-enrichment block. The pipeline
  // builds this once in researchSubject() and stores it on ResearchInputs, so
  // we reuse it verbatim (and this module stays DB-free + unit-testable).
  enrichmentBlock: string;
  gatewayModelId: string;
  modelLabel: "opus" | "sonnet" | "haiku";
}): Promise<{ object: ScoringResult; usage: ScoringUsage }> {
  const prompt = buildInfoPrompt(
    args.linkedinUrl,
    args.searchHighlights,
    args.linkedinPageText,
    args.enrichmentBlock,
  );

  let object: ScoringResult | null = null;
  let gen: Awaited<ReturnType<typeof generateText>> | undefined;
  let lastErr = "";
  for (let attempt = 1; attempt <= 2 && !object; attempt++) {
    gen = await generateText({
      model: args.gatewayModelId,
      temperature: 0.2,
      maxOutputTokens: 2500,
      prompt,
    });
    try {
      object = infoToScoringResult(extractFirstJsonObject(gen.text) as RawInfo);
    } catch (e) {
      lastErr = (e as Error)?.message ?? String(e);
      console.error(`[connect-info] parse failed (attempt ${attempt}/2): ${lastErr.slice(0, 200)}`);
    }
  }
  // Fall back to a minimal data-only profile (no bio/tags) so the eval still
  // persists and the enrichment facts + data-sources roster still surface.
  if (!object) {
    console.warn(`[connect-info] giving up after 2 attempts (${lastErr.slice(0, 120)}); persisting data-only info profile`);
    object = infoToScoringResult({});
  }

  const u = (gen?.usage ?? {}) as { inputTokens?: number; outputTokens?: number; cachedInputTokens?: number };
  const gw = ((gen?.providerMetadata?.gateway ?? {}) as { cost?: unknown; generationId?: unknown }) || {};
  const realCost = typeof gw.cost === "string" ? Number(gw.cost) : typeof gw.cost === "number" ? gw.cost : NaN;
  const usage: ScoringUsage = {
    model: args.modelLabel,
    inputTokens: u.inputTokens ?? 0,
    outputTokens: u.outputTokens ?? 0,
    cachedInputTokens: u.cachedInputTokens ?? 0,
    costUsd: Number.isFinite(realCost) ? realCost : 0,
    costSource: Number.isFinite(realCost) ? "gateway" : "estimated",
  };
  if (typeof gw.generationId === "string") usage.generationId = gw.generationId;
  return { object, usage };
}

// Re-exported for callers that want the empty/fallback info result (e.g.
// low-signal connect-mode evals).
export function emptyInfoScoringResult(): ScoringResult {
  return infoToScoringResult({});
}

export type { MMHit };

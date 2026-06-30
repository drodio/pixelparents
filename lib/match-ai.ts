// AI-assisted semantic re-ranker for the Community "people who can help" matcher.
//
// The deterministic tag-overlap matcher (lib/ask-matching.rankCandidates) is a
// great PRE-FILTER but a blunt RANKER: it only sees exact tag matches and can't
// tell that "fundraising" is close to "raised a seed round" or that an EdTech
// founder is a strong fit for an ask about classroom software. This module takes
// the deterministic top candidates + their curated info-profiles and asks the
// model (via the existing Vercel AI Gateway — same wiring as
// lib/enrichment/info-extract.ts) to RE-RANK them and write a one-line, human
// rationale per match ("strong on EdTech + fundraising").
//
// Hard requirements honored here:
//   - ONE cheap model call over the whole candidate set (not one-per-candidate).
//   - Graceful fallback: no key / call fails / bad output → return the candidates
//     in their deterministic order, rationale-less. NEVER throws to the caller.
//   - Cached per ask so re-renders (force-dynamic detail page) don't re-pay.
//   - No PII leaves: we send ONLY the curated, shareable info-profile slice
//     (bio / expertise / how-they-can-help) + the matcher's expertise signals —
//     the same non-PII data already used for matching. No names that aren't
//     already public, no emails/phones, no raw fact dumps.

import { z } from "zod";
import type { AskMatch } from "@/lib/ask-matching";

// Read env LAZILY (inside functions) — mirrors info-extract.ts so a serverless
// cold start that populates process.env after import still works. Gateway uses
// "provider/model"; direct Anthropic uses the bare model id.
const gwKey = () => process.env.VERCEL_AI_GATEWAY || process.env.AI_GATEWAY_API_KEY;
const antKey = () => process.env.ANTHROPIC_API_KEY;
const gwModel = () => process.env.MATCH_AI_MODEL || "anthropic/claude-haiku-4-5";
const antModel = () => process.env.MATCH_AI_MODEL || "claude-haiku-4-5-20251001";

export function hasModelKey(): boolean {
  return Boolean(gwKey() || antKey());
}

// The minimal ask shape the re-ranker needs. Title/body give the model the
// semantic intent; tags anchor it to the same vocabulary the candidates use.
export type AiAsk = {
  // A stable id for cache-keying the result (so re-renders don't re-pay).
  id: string;
  title: string;
  body: string;
  tags: string[];
  // "ask" (someone needs help) or "offer" (someone offers help) — flips the
  // framing so the rationale reads correctly for both directions.
  kind: "ask" | "offer";
};

// One candidate's worth of matchable, SHAREABLE profile data. `signupId` keys
// back to the deterministic AskMatch. `displayName` is only ever the name the
// matcher already resolved (already coarsened for students upstream). The rest
// is the curated info-profile slice + expertise signals — all non-PII.
export type AiCandidate = {
  signupId: string;
  displayName: string | null;
  // The matcher's expertise signal union (enrichment tags + skillsets + interests).
  expertiseSignals: string[];
  // Curated, shareable enrichment (may be null when the member shared none).
  bio: string | null;
  enrichmentExpertise: string[];
  canHelpWith: string[];
};

// Per-ask result cache. Keyed by ask id + a hash of the candidate set so a
// changed candidate roster (someone newly matches) re-runs, but identical
// re-renders are free. Bounded so it can't grow without limit in a long-lived
// server process.
const CACHE_MAX = 200;
const cache = new Map<string, AskMatch[]>();

function cacheKey(ask: AiAsk, candidates: AiCandidate[]): string {
  // Order-independent candidate fingerprint (signupId is stable + unique).
  const ids = candidates.map((c) => c.signupId).sort().join(",");
  return `${ask.id}::${ask.tags.join("|")}::${ids}`;
}

function rememberInCache(key: string, value: AskMatch[]): AskMatch[] {
  // Simple FIFO eviction — drop the oldest entry when full.
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
  return value;
}

// Exposed for tests so they start from a clean slate.
export function _clearMatchCache(): void {
  cache.clear();
}

// The model's per-candidate verdict. `rationale` is the one-liner shown on the
// card; `signupId` lets us map back. We DON'T trust the model to invent a score
// magnitude — order in the array IS the ranking.
const AiRankItemSchema = z.object({
  signupId: z.string(),
  rationale: z.string(),
});
const AiRankSchema = z.object({
  ranked: z.array(AiRankItemSchema),
});

function buildPrompt(ask: AiAsk, candidates: AiCandidate[]): string {
  const intent =
    ask.kind === "offer"
      ? "A community member is OFFERING help/expertise. Rank the people most likely to be INTERESTED in or to BENEFIT from this offer."
      : "A community member is ASKING for help. Rank the people best positioned to HELP with this ask.";

  const candBlock = candidates
    .map((c, i) => {
      const lines = [`#${i + 1} id=${c.signupId}`];
      if (c.displayName) lines.push(`  name: ${c.displayName}`);
      if (c.expertiseSignals.length) lines.push(`  signals: ${c.expertiseSignals.join(", ")}`);
      if (c.bio) lines.push(`  bio: ${c.bio}`);
      if (c.enrichmentExpertise.length)
        lines.push(`  expertise: ${c.enrichmentExpertise.join(", ")}`);
      if (c.canHelpWith.length) lines.push(`  can help with: ${c.canHelpWith.join(", ")}`);
      return lines.join("\n");
    })
    .join("\n\n");

  return `You are matching community members to a post in a school-parent community (Stanford OHS families). ${intent}

POST
title: ${ask.title}
body: ${ask.body}
topic tags: ${ask.tags.join(", ") || "(none)"}

CANDIDATES (pre-filtered by tag overlap; you re-rank by semantic fit):
${candBlock}

Return ONLY a single JSON object (no prose, no markdown fences) of this shape:
{
  "ranked": [
    { "signupId": "<id>", "rationale": "<one short phrase, e.g. 'strong on EdTech + fundraising'>" }
  ]
}

Rules:
- Include ONLY candidates with a genuine fit; drop weak/irrelevant ones. It is fine to return fewer than the input.
- Order "ranked" best fit first.
- Each rationale is a SHORT, concrete phrase (max ~8 words) naming WHY they fit — reference their actual expertise. No full sentences, no fluff, no names.
- Use ONLY the provided ids. Do not invent ids or candidates.`;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object in model response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// Override hook for tests: inject a fake model callable instead of hitting the net.
export type ModelCall = (prompt: string) => Promise<string>;

async function callModel(prompt: string): Promise<string> {
  const gw = gwKey();
  if (gw) {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${gw}` },
      body: JSON.stringify({
        model: gwModel(),
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`AI Gateway ${res.status}: ${await res.text().catch(() => "")}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  }
  const ant = antKey();
  if (ant) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ant,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: antModel(),
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text ?? "";
  }
  throw new Error("No model key (set VERCEL_AI_GATEWAY or ANTHROPIC_API_KEY)");
}

// Re-rank the deterministic matches semantically.
//
// `deterministic` is the pre-filtered, tag-overlap-ranked list from
// rankCandidates (the fallback + candidate set). `candidates` carries each one's
// shareable profile, keyed by signupId. Returns a NEW AskMatch[] in the AI's
// order with a one-line `rationale` attached to each, or — on no key / failure /
// empty input — the deterministic list UNCHANGED (no rationale). Never throws.
//
// `model` is injectable for tests. The result is cached per (ask, candidate set).
export async function aiRankMatches(
  ask: AiAsk,
  deterministic: AskMatch[],
  candidates: AiCandidate[],
  model: ModelCall = callModel,
): Promise<AskMatch[]> {
  // Nothing to do / nothing to gain → deterministic order.
  if (deterministic.length <= 1) return deterministic;
  if (!hasModelKey() && model === callModel) return deterministic;

  const key = cacheKey(ask, candidates);
  const cached = cache.get(key);
  if (cached) return cached;

  const bySignup = new Map(deterministic.map((m) => [m.signupId, m]));

  try {
    const text = await model(buildPrompt(ask, candidates));
    const parsed = AiRankSchema.safeParse(extractJson(text));
    if (!parsed.success) return rememberInCache(key, deterministic);

    const reranked: AskMatch[] = [];
    const used = new Set<string>();
    for (const item of parsed.data.ranked) {
      const base = bySignup.get(item.signupId);
      if (!base || used.has(item.signupId)) continue; // ignore invented/dupe ids
      used.add(item.signupId);
      const rationale = item.rationale.trim();
      reranked.push(rationale ? { ...base, rationale } : { ...base });
    }

    // If the model returned nothing usable, fall back to deterministic order.
    if (reranked.length === 0) return rememberInCache(key, deterministic);

    // Append any candidates the model dropped, in deterministic order, so we
    // never silently lose a valid suggestion the privacy/overlap layer allowed.
    for (const m of deterministic) {
      if (!used.has(m.signupId)) reranked.push(m);
    }

    return rememberInCache(key, reranked);
  } catch {
    // Any failure (network, parse, bad JSON) → deterministic fallback. Cache it
    // so a transient failure doesn't re-pay on every re-render of this ask.
    return rememberInCache(key, deterministic);
  }
}

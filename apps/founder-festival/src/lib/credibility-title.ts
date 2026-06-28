// Cheap, title-ONLY generation pass — backfills evaluations.credibility_title
// for profiles that have none, without a full re-score (no Exa, no LinkedIn
// fetch). Feeds the model the person's already-stored evidence (score breakdown
// reasons + summary + identity) and asks for the one-sentence headline shown
// above their badges, mirroring the CREDIBILITY TITLE rubric spec.
//
// Background: the title was historically never emitted because SCHEMA_HINT
// omitted the field (fixed in eval-pipeline.ts). This pass fills the existing
// null-title backlog so they don't all need a paid re-score.

import { generateText } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";

const MODEL_ID = {
  sonnet: "anthropic/claude-sonnet-4-6",
  haiku: "anthropic/claude-haiku-4-5",
  opus: "anthropic/claude-opus-4-7",
} as const;
export type TitleModel = keyof typeof MODEL_ID;

const TitleSchema = z.object({ credibilityTitle: z.string().nullable().catch(null) });

type Breakdown = { founder?: Array<{ points: number; reason: string }>; investor?: Array<{ points: number; reason: string }> } | null;
type Recs = { summary?: string | null } | null;
type Identity = { companyName?: string | null; jobTitle?: string | null; headline?: string | null } | null;

// First balanced {...} object in the response (tolerates ```json fences).
function extractJsonObject(text: string): unknown {
  let s = text.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  const start = s.indexOf("{");
  if (start === -1) throw new Error("no JSON object");
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
  if (end === -1) throw new Error("unbalanced braces");
  return JSON.parse(s.slice(start, end + 1));
}

function buildPrompt(input: {
  fullName: string | null;
  companyStage: string | null;
  identity: Identity;
  reasons: string[];
  summary: string | null;
}): string {
  return `You write the ONE-sentence credibility headline shown above a person's profile badges on "Founder Festival" (an invite-only community of top founders and investors).

Below is everything we already know about this person from their scored profile. Write a "credibilityTitle": ONE punchy sentence (≈ 4–14 words, no trailing period) describing who they are at their most impressive. Lead with the strongest, most-verifiable credential and what they're doing now. Factual and specific; no hype, no scores, no point values, no numbers you can't support.
  ✓ "4x-exited YC founder and angel investor now building Chief"
  ✓ "Stripe co-founder and CEO scaling internet payments"
  ✓ "Sequoia partner backing early-stage AI infrastructure"
  ✗ "+1200 founder points" (NEVER reference points/scores)
  ✗ "A highly impressive and accomplished leader" (vague hype)
Set credibilityTitle to null ONLY if the evidence below is too thin to say anything specific.

Person: ${input.fullName ?? "(name unknown)"}
${input.identity?.headline ? `Headline: ${input.identity.headline}\n` : ""}${input.identity?.jobTitle || input.identity?.companyName ? `Role: ${[input.identity?.jobTitle, input.identity?.companyName].filter(Boolean).join(" @ ")}\n` : ""}${input.companyStage ? `Company stage: ${input.companyStage}\n` : ""}${input.summary ? `Summary: ${input.summary}\n` : ""}Top scored credentials (points · reason):
${input.reasons.length ? input.reasons.map((r) => `- ${r}`).join("\n") : "(none)"}

Return ONLY a single JSON object (no prose, no markdown fences): {"credibilityTitle": string | null}`;
}

export type TitleResult = {
  updated: boolean;
  title: string | null;
  costUsd: number;
  skippedReason?: string;
};

// Generate + persist a credibility title for one eval from already-stored data.
// Skips evals that already have a title, or whose score is 0 (thin → rubric says
// null). Returns {updated:false} with a reason otherwise.
export async function generateCredibilityTitle(evalId: string, model: TitleModel = "sonnet"): Promise<TitleResult> {
  const [row] = await db
    .select({
      fullName: evaluations.fullName,
      score: evaluations.score,
      companyStage: evaluations.companyStage,
      credibilityTitle: evaluations.credibilityTitle,
      breakdown: evaluations.breakdown,
      recommendations: evaluations.recommendations,
      profile: evaluations.profile,
    })
    .from(evaluations)
    .where(eq(evaluations.id, evalId))
    .limit(1);
  if (!row) return { updated: false, title: null, costUsd: 0, skippedReason: "eval not found" };
  if (row.credibilityTitle && row.credibilityTitle.trim()) {
    return { updated: false, title: row.credibilityTitle, costUsd: 0, skippedReason: "already has title" };
  }
  if ((row.score ?? 0) <= 0) return { updated: false, title: null, costUsd: 0, skippedReason: "score 0 (too thin)" };

  const bd = (row.breakdown ?? null) as Breakdown;
  const reasons = [...(bd?.founder ?? []), ...(bd?.investor ?? [])]
    .filter((r) => r && typeof r.reason === "string" && r.reason.trim())
    .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    .slice(0, 10)
    .map((r) => `${r.points} · ${r.reason.trim()}`);
  const summary = ((row.recommendations ?? null) as Recs)?.summary?.trim() || null;
  const identity = ((row.profile ?? null) as { identity?: Identity } | null)?.identity ?? null;

  const prompt = buildPrompt({ fullName: row.fullName, companyStage: row.companyStage, identity, reasons, summary });

  let costUsd = 0;
  let lastErr = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const gen = await generateText({ model: MODEL_ID[model], temperature: 0.4, maxOutputTokens: 200, prompt });
    const gw = (gen.providerMetadata?.gateway ?? {}) as { cost?: unknown };
    const c = typeof gw.cost === "string" ? Number(gw.cost) : typeof gw.cost === "number" ? gw.cost : NaN;
    if (Number.isFinite(c)) costUsd = c;
    try {
      const parsed = TitleSchema.safeParse(extractJsonObject(gen.text));
      if (parsed.success) {
        const title = parsed.data.credibilityTitle?.trim() || null;
        if (!title) return { updated: false, title: null, costUsd, skippedReason: "model returned null (too thin)" };
        await db.update(evaluations).set({ credibilityTitle: title }).where(eq(evaluations.id, evalId));
        return { updated: true, title, costUsd };
      }
      lastErr = "schema mismatch";
    } catch (e) {
      lastErr = (e as Error)?.message ?? String(e);
    }
  }
  throw new Error(`title unparseable after 2 attempts: ${lastErr.slice(0, 120)}`);
}

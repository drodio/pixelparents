import { generateText } from "ai";
import { db } from "@/db";
import { evaluations, scoreItems } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { sanitizeRecapHtml } from "@/lib/event-recap";
import { chiefSearch, chiefConfigured } from "@/lib/chief";
import { preferredFirstName } from "@/lib/preferred-name";

// Personalized post-event learnings: take ALL of an event's learnings (public +
// members + attendees) and the person's full Festival profile, and craft probing,
// challenging, supportive learnings tailored to that one person. Two backends:
// the AI Gateway (fast, metered in tokens) and Chief (deep research, metered in
// opaque "credits" → we can only report the CALL COUNT). See lib/chief.ts.

// Best-quality model for the non-Chief path. Opus-class for the "omg these are
// so good" bar the feature is aiming at.
const AI_MODEL = "anthropic/claude-opus-4-7";

// Rough public list prices (USD per 1M tokens) for a cost ESTIMATE only — the
// real figure is on the Vercel AI Gateway spend page. Opus-class in/out.
const PRICE_PER_M = { input: 15, output: 75 };

function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// All three learnings tiers as one labeled plain-text block.
export function gatherEventLearnings(event: {
  title: string;
  learningsPublic: string | null;
  learningsMembers: string | null;
  learningsAttendees: string | null;
}): string {
  const parts = [
    event.learningsPublic ? `PUBLIC LEARNINGS:\n${stripHtml(event.learningsPublic)}` : "",
    event.learningsMembers ? `MEMBERS-ONLY LEARNINGS:\n${stripHtml(event.learningsMembers)}` : "",
    event.learningsAttendees ? `ATTENDEES-ONLY LEARNINGS:\n${stripHtml(event.learningsAttendees)}` : "",
  ].filter(Boolean);
  return parts.join("\n\n");
}

// Assemble the person's Festival profile into a single text block the model can
// reason over: name, headline, scores/statuses, the "what you need" summary, any
// manual hint, and the per-dimension scoring rationale (the richest signal).
export async function buildProfileSummary(evaluationId: string): Promise<{ summary: string; firstName: string }> {
  const [e] = await db
    .select({
      fullName: evaluations.fullName,
      credibilityTitle: evaluations.credibilityTitle,
      score: evaluations.score,
      founderScore: evaluations.founderScore,
      investorScore: evaluations.investorScore,
      founderStatus: evaluations.founderStatus,
      investorStatus: evaluations.investorStatus,
      companyStage: evaluations.companyStage,
      recommendations: evaluations.recommendations,
      manualProfileHint: evaluations.manualProfileHint,
    })
    .from(evaluations)
    .where(eq(evaluations.id, evaluationId))
    .limit(1);
  if (!e) return { summary: "", firstName: "there" };

  const items = await db
    .select({ rubric: scoreItems.rubric, reason: scoreItems.reason, points: scoreItems.points })
    .from(scoreItems)
    .where(eq(scoreItems.evaluationId, evaluationId))
    .orderBy(asc(scoreItems.sortOrder));

  const recSummary = (e.recommendations as { summary?: string } | null)?.summary ?? "";
  const firstName = await preferredFirstName(evaluationId);

  const lines = [
    `Name: ${e.fullName ?? "Unknown"}`,
    e.credibilityTitle ? `Headline: ${e.credibilityTitle}` : "",
    `Festival scores — combined ${e.score}, founder ${e.founderScore} (${e.founderStatus ?? "n/a"}), investor ${e.investorScore} (${e.investorStatus ?? "n/a"}).`,
    e.companyStage ? `Company stage: ${e.companyStage}` : "",
    recSummary ? `What they likely need (Festival summary): ${recSummary}` : "",
    e.manualProfileHint ? `Operator notes: ${e.manualProfileHint}` : "",
    items.length
      ? `Scoring rationale by dimension:\n${items
          .map((i) => `- ${i.rubric} (${i.points}): ${i.reason}`)
          .join("\n")
          .slice(0, 6000)}`
      : "",
  ].filter(Boolean);

  return { summary: lines.join("\n"), firstName };
}

// The shared instruction. We ask for clean, minimal HTML so it renders in the
// same prose box as the other learnings tiers.
export function personalizedPrompt(firstName: string, profileSummary: string, learningsText: string): string {
  return `You are an extraordinary executive coach and operator writing PRIVATE, personalized post-event learnings for ${firstName}, based on a real Founder Festival event and ${firstName}'s actual Festival profile.

GOAL: ${firstName} should read this and think "oh my god, I can't believe how good these are." Make it feel hand-written for them — specific, not generic. Be probing AND challenging AND genuinely helpful AND supportive, all at once. Name the hard thing kindly. Connect the event's themes to where THIS person specifically is in their journey (their scores, status, stage, and the scoring rationale). Give a few concrete, do-this-next moves, not platitudes.

RULES:
- Ground every point in BOTH the event learnings and ${firstName}'s profile. No filler, no flattery-for-its-own-sake, no restating the event agenda.
- 4–7 punchy points. Each: a bold takeaway, then 1–2 sentences of why-it-matters-for-${firstName} and a specific next step.
- Warm, direct, peer-to-peer voice. Second person ("you").
- Output CLEAN HTML ONLY (no markdown, no <html>/<body>): use <p>, <strong>, <ul>/<li>, and <h3> for any sub-headers. No inline styles.

=== EVENT LEARNINGS ===
${learningsText || "(none provided)"}

=== ${firstName.toUpperCase()}'S FESTIVAL PROFILE ===
${profileSummary || "(no profile data)"}`;
}

export type AiResult = {
  html: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  model: string;
};

// Non-Chief generation via the AI Gateway. Returns HTML + token usage + an
// estimated dollar cost (real cost is on the gateway spend page).
export async function generatePersonalizedAI(prompt: string): Promise<AiResult> {
  const t0 = Date.now();
  // Generous cap so a thorough set of learnings isn't truncated mid-sentence.
  const gen = await generateText({ model: AI_MODEL, temperature: 0.7, maxOutputTokens: 4000, prompt });
  const u = gen.usage as { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number };
  const inputTokens = u?.inputTokens ?? u?.promptTokens ?? 0;
  const outputTokens = u?.outputTokens ?? u?.completionTokens ?? 0;
  const estCostUsd =
    (inputTokens / 1_000_000) * PRICE_PER_M.input + (outputTokens / 1_000_000) * PRICE_PER_M.output;
  return {
    html: sanitizeRecapHtml(gen.text) || gen.text.trim(),
    ms: Date.now() - t0,
    inputTokens,
    outputTokens,
    estCostUsd,
    model: AI_MODEL,
  };
}

export type ChiefResultMeta =
  | { html: string; ms: number; calls: number; credits: { total: number; ingress: number; egress: number } | null }
  | { error: string };

// Chief generation (deep research). As of 2026-06-19 the API returns per-search
// credit usage, so we report exact credits (total/ingress/egress) plus the call
// count. `credits` is null only if an older API build omits the fields.
export async function generatePersonalizedChief(prompt: string): Promise<ChiefResultMeta> {
  if (!chiefConfigured()) return { error: "Chief not configured (CHIEF_API_TOKEN / CHIEF_PROJECT_ID missing)." };
  const res = await chiefSearch(prompt, { intelligence: "research", publicData: true, maxWaitMs: 300_000 });
  if (!res) return { error: "Chief returned no result (timeout or API error)." };
  return { html: sanitizeRecapHtml(res.text) || res.text.trim(), ms: res.ms, calls: res.calls, credits: res.credits };
}

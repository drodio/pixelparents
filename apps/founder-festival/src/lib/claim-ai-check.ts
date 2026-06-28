import { generateText } from "ai";
import { z } from "zod";
import { getExaClient } from "./exa";

// "Run AI Check" on an owner-proposed claim (a pending score-item edit): search
// INDEPENDENT public data about the claim + person, then have an LLM return a
// confidence (0-100) that the claim is true & verifiable. Goal: cut the human's
// load on deciding whether to approve. Best-effort — never throws.

const MODEL = "anthropic/claude-sonnet-4-6";

export type ClaimVerdict = "verified" | "partial" | "unverified" | "contradicted";
export type ClaimAiCheck = {
  confidence: number; // 0-100 that the claim is TRUE + verifiable from public sources
  verdict: ClaimVerdict;
  summary: string; // one sentence citing the evidence (or its absence)
  sources: string[];
};

const Schema = z.object({
  confidence: z.number().int().min(0).max(100),
  verdict: z.enum(["verified", "partial", "unverified", "contradicted"]),
  summary: z.string(),
});

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function aiCheckClaim(fullName: string | null, claim: string): Promise<ClaimAiCheck> {
  // 1) Independent public-data search.
  const highlights: string[] = [];
  const sources: string[] = [];
  try {
    const exa = getExaClient();
    const q = `${fullName ?? ""} ${claim}`.trim();
    const res = (await exa.search(q, {
      type: "auto",
      numResults: 8,
      contents: { highlights: true },
    })) as unknown as { results?: Array<{ url?: string; title?: string; highlights?: string[] }> };
    for (const r of res.results ?? []) {
      if (r.url) sources.push(r.url);
      for (const h of r.highlights ?? []) highlights.push(h);
    }
  } catch {
    // search failure → the LLM judges on "(no public data found)".
  }

  // 2) LLM verifiability verdict.
  const prompt = `A person edited their Founder Festival profile and is CLAIMING the following about themselves:
"${claim}"
${fullName ? `Their name is ${fullName}.` : ""}

Independent public web data found about them (snippets):
${highlights.slice(0, 25).map((h, i) => `[${i + 1}] ${h.replace(/\s+/g, " ").slice(0, 220)}`).join("\n") || "(no public data found)"}

Assess how confident you are that THIS SPECIFIC claim is TRUE and VERIFIABLE from INDEPENDENT public sources — not just the person's own assertion. Be skeptical:
- Strong independent corroboration → "verified" (high confidence).
- Some support but incomplete → "partial".
- No corroborating public evidence → "unverified" (LOW confidence — absence of evidence is NOT verification).
- Evidence contradicts the claim → "contradicted" (confidence ~0).

Return ONLY JSON: {"confidence": <0-100 int>, "verdict": "verified"|"partial"|"unverified"|"contradicted", "summary": "<one sentence citing the evidence or its absence>"}`;

  try {
    const gen = await generateText({ model: MODEL, temperature: 0.2, maxOutputTokens: 500, prompt });
    const parsed = Schema.safeParse(extractJson(gen.text));
    if (parsed.success) {
      return { ...parsed.data, sources: [...new Set(sources)].slice(0, 6) };
    }
  } catch {
    // fall through
  }
  return { confidence: 0, verdict: "unverified", summary: "AI check could not complete.", sources: [...new Set(sources)].slice(0, 6) };
}

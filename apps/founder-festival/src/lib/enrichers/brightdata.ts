import type { EnrichCtx } from "./index";
import type { EnrichmentResult } from "./types";
import { fetchBrightDataLinkedinProfile, type BrightDataLinkedinProfile } from "../brightdata";

// BrightData enricher — pulls a structured LinkedIn profile BY URL (so identity
// is exact; no same-name ambiguity to corroborate). Surfaces signals the Exa /
// EnrichLayer text path misses: follower reach, recent activity, full experience
// (when public), education, certifications, languages. The follower COUNT is
// scored deterministically downstream (addLinkedinFollowersBonus) — the rubric
// is told not to award points for it — so here we only surface it as context.
//
// Best-effort: returns empty on missing key, no profile, or timeout. The whole
// call is bounded by the registry's per-source timeout (see ENRICHERS).

// BrightData LinkedIn collection takes ~3–18s server-side; cap our wait under the
// enricher deadline so a slow scrape fails safe rather than blocking the eval.
const MAX_WAIT_MS = 20_000;

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function buildFacts(p: BrightDataLinkedinProfile): string[] {
  const facts: string[] = [];
  const followers = Number(p.followers);
  if (Number.isFinite(followers) && followers > 0) {
    facts.push(
      `LinkedIn followers: ${fmt(followers)}. (NOTE: follower count is scored automatically by the system — do NOT award founder/investor points for it yourself.)`,
    );
  }
  const company = p.current_company?.name ?? p.current_company_name;
  if (company) facts.push(`Current company on LinkedIn: ${company}.`);

  const exp = (p.experience ?? []).filter(Boolean);
  if (exp.length > 0) {
    facts.push(`LinkedIn experience (${exp.length} roles):`);
    for (const e of exp.slice(0, 10)) {
      const span = [e.start_date, e.end_date ?? "present"].filter(Boolean).join("–");
      facts.push(`  • ${e.title ?? "?"} @ ${e.company ?? "?"}${span ? ` [${span}]` : ""}`);
    }
  }
  const edu = (p.education ?? []).filter((e) => e && (e.title || e.degree || e.field));
  if (edu.length > 0) {
    facts.push(
      `Education: ${edu
        .slice(0, 6)
        .map((e) => [e.title, e.degree, e.field].filter(Boolean).join(" "))
        .filter(Boolean)
        .join("; ")}.`,
    );
  }
  const awards = (p.honors_and_awards ?? []).map((a) => a?.title).filter(Boolean) as string[];
  if (awards.length > 0) facts.push(`Honors & awards: ${awards.slice(0, 8).join("; ")}.`);

  const certs = (p.certifications ?? []).length;
  if (certs > 0) facts.push(`Holds ${certs} listed certification${certs === 1 ? "" : "s"}.`);

  const langs = (p.languages ?? []).map((l) => l?.title).filter(Boolean) as string[];
  if (langs.length > 1) facts.push(`Speaks ${langs.length} languages: ${langs.join(", ")}.`);

  const recs = Number(p.recommendations_count);
  if (Number.isFinite(recs) && recs > 0) {
    facts.push(`${recs} LinkedIn recommendation${recs === 1 ? "" : "s"} from colleagues (peer-vouched credibility).`);
  }

  const activity = (p.activity ?? []).length;
  if (activity > 0) facts.push(`${activity} recent LinkedIn posts/engagements (active distribution).`);

  return facts;
}

export async function enrichWithBrightData(ctx: EnrichCtx): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "brightdata", facts: [], citations: [] };
  if (!process.env.BRIGHTDATA_API_KEY) {
    return { source: "brightdata", status: "no_api_key", note: "API key not set", facts: [], citations: [] };
  }
  if (!ctx.linkedinUrl) return empty;

  try {
    const result = await fetchBrightDataLinkedinProfile(ctx.linkedinUrl, { maxWaitMs: MAX_WAIT_MS });
    if (!result) return empty;
    const facts = buildFacts(result.profile);
    if (facts.length === 0) return empty;
    return {
      source: "brightdata",
      facts,
      citations: [ctx.linkedinUrl],
      // raw carries the full record; addLinkedinFollowersBonus reads .followers.
      raw: result.raw,
    };
  } catch {
    return empty;
  }
}

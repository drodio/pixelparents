import type { EnricherContext, EnrichmentResult } from "./types";
import { nameOverlaps } from "./identity";

// OpenAlex — free academic research index; no API key required.
// Polite-pool header: mailto query param routes us to a faster tier.
//
// Strategy: name-search the OpenAlex authors endpoint; accept only candidates
// whose display_name passes nameOverlaps (precision over recall — academic
// disambiguation is hard and common names create false positives). Among
// confirmed candidates, pick the one with the highest cited_by_count.
//
// Meaningful-footprint gate: works_count >= 3 AND cited_by_count >= 50.
// This prevents a one-paper namesake (or a non-academic founder who happened
// to co-author once) from surfacing as a research signal.

const UA = "founder-festival-eval/1.0 (https://festival.so)";
const BASE = "https://api.openalex.org";
const MAILTO = "mailto=drodio@storytell.ai";

// Minimum thresholds for a "meaningful research footprint."
const MIN_WORKS = 3;
const MIN_CITATIONS = 50;

type OAInstitution = { display_name?: string };
type OAConcept = { display_name?: string; level?: number; score?: number };
type OATopic = { display_name?: string };
type OASummaryStats = { h_index?: number; i10_index?: number; "2yr_mean_citedness"?: number };

type OAAuthor = {
  id?: string;
  orcid?: string | null;
  display_name?: string;
  works_count?: number;
  cited_by_count?: number;
  summary_stats?: OASummaryStats;
  last_known_institutions?: OAInstitution[];
  x_concepts?: OAConcept[];
  topics?: OATopic[];
};

type OASearchResponse = { results?: OAAuthor[] };

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Extract top field names from x_concepts or topics (prefer topics when available).
function topFields(author: OAAuthor): string[] {
  const topics = (author.topics ?? [])
    .map((t) => t.display_name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 3);
  if (topics.length > 0) return topics;

  // Fall back to x_concepts — filter to level >= 1 for specificity.
  return (author.x_concepts ?? [])
    .filter((c) => (c.level ?? 0) >= 1 && Boolean(c.display_name))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map((c) => c.display_name as string)
    .slice(0, 3);
}

export async function enrichWithOpenAlex(ctx: EnricherContext): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "openalex", facts: [], citations: [] };
  if (!ctx.fullName) return empty;

  const searchUrl = `${BASE}/authors?search=${encodeURIComponent(ctx.fullName)}&per_page=5&${MAILTO}`;
  const data = await fetchJson<OASearchResponse>(searchUrl);
  const results = data?.results ?? [];

  // Filter to name-matched candidates only (first + last token must appear).
  const matched = results.filter((r) => nameOverlaps(ctx.fullName, r.display_name ?? ""));

  // Pick the candidate with the highest citation count.
  const best = matched.sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))[0];
  if (!best) return empty;

  // Meaningful-footprint gate.
  const worksCount = best.works_count ?? 0;
  const citedByCount = best.cited_by_count ?? 0;
  if (worksCount < MIN_WORKS || citedByCount < MIN_CITATIONS) return empty;

  const hIndex = best.summary_stats?.h_index ?? 0;
  const i10Index = best.summary_stats?.i10_index;
  const displayName = best.display_name ?? ctx.fullName;

  const facts: string[] = [];

  // Primary summary line.
  facts.push(
    `OpenAlex: ${displayName} — h-index ${hIndex}, ${citedByCount.toLocaleString("en-US")} citations across ${worksCount.toLocaleString("en-US")} works.`,
  );

  // Research areas.
  const fields = topFields(best);
  if (fields.length > 0) {
    facts.push(`Research areas: ${fields.join(", ")}.`);
  }

  // Affiliation.
  const institutions = (best.last_known_institutions ?? [])
    .map((i) => i.display_name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 2);
  if (institutions.length > 0) {
    facts.push(`Affiliation: ${institutions.join("; ")}.`);
  }

  // Optional institution corroboration from LinkedIn page text.
  const pageTextLower = ctx.linkedinPageText.toLowerCase();
  const highlightText = ctx.searchHighlights
    .flatMap((h) => h.highlights)
    .join(" ")
    .toLowerCase();
  const combinedText = `${pageTextLower} ${highlightText}`;
  const institutionCorroborated = institutions.some((inst) =>
    combinedText.includes(inst.toLowerCase().split(/\s+/)[0]!),
  );
  if (institutionCorroborated) {
    facts.push(`Institution corroborated via LinkedIn/Exa data.`);
  }

  // Extra i10 index detail if notable.
  if (i10Index != null && i10Index >= 10) {
    facts.push(`i10-index: ${i10Index.toLocaleString("en-US")} (papers with ≥10 citations).`);
  }

  // Build citation URLs.
  const citations: string[] = [];
  if (best.id) citations.push(best.id);
  if (best.orcid) citations.push(best.orcid);

  return {
    source: "openalex",
    facts,
    citations,
    raw: {
      openalex_id: best.id,
      display_name: displayName,
      h_index: hIndex,
      i10_index: i10Index,
      works_count: worksCount,
      cited_by_count: citedByCount,
      top_fields: fields,
      institution: institutions[0] ?? null,
    },
  };
}

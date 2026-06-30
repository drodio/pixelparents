import type { EnricherContext, EnrichmentResult } from "./types";

// Google Knowledge Graph Search API (kgsearch.googleapis.com, free with
// GOOGLE_API_KEY). A KG entity means Google maintains a knowledge panel for the
// person — a notability THRESHOLD that's hard to manufacture. We gate on name match
// + CORROBORATION (the entity description ties to the subject) so a same-named
// celebrity's panel can't attach. No-ops gracefully without the key.

const KG = "https://kgsearch.googleapis.com/v1/entities:search";
const UA = "founder-festival-eval/1.0";

type KgResult = {
  itemListElement?: Array<{
    resultScore?: number;
    result?: {
      name?: string;
      "@type"?: string[];
      description?: string;
      detailedDescription?: { articleBody?: string; url?: string };
    };
  }>;
};

// Both first AND last name present in the entity name (precision over recall).
export function kgNameOverlap(fullName: string | null, entityName: string): boolean {
  if (!fullName) return false;
  const a = fullName.toLowerCase().split(/\s+/).filter(Boolean);
  const b = new Set(entityName.toLowerCase().split(/\s+/).filter(Boolean));
  const overlap = a.filter((p) => b.has(p)).length;
  return a.length >= 2 ? overlap >= 2 : overlap >= 1;
}

const BIZ_TECH =
  /founder|co-?founder|\bceo\b|\bcto\b|\bcoo\b|entrepreneur|executive|businessman|businesswoman|technolog|software|investor|venture|startup|engineer|computer scientist|chief executive|industrialist|programmer/i;

// The entity is corroborated as the SUBJECT if its description either reads as a
// tech/business person OR mentions a significant token from the subject's own data
// (e.g. their company name). Prevents attaching a same-named actor/athlete's panel.
export function kgCorroborated(desc: string, subjectTokens: Set<string>): boolean {
  if (!desc) return false;
  if (BIZ_TECH.test(desc)) return true;
  return desc
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4)
    .some((t) => subjectTokens.has(t));
}

function subjectTokens(ctx: EnricherContext): Set<string> {
  const text = [ctx.linkedinPageText ?? "", ...(ctx.searchHighlights ?? []).flatMap((h) => [h.title ?? "", ...(h.highlights ?? [])])]
    .join(" ")
    .toLowerCase();
  return new Set(text.split(/[^a-z0-9]+/).filter((t) => t.length >= 4));
}

export async function enrichWithGoogleKg(ctx: EnricherContext): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "google-kg", facts: [], citations: [] };
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    return { source: "google-kg", status: "no_api_key", note: "API key not set", facts: [], citations: [] };
  }
  if (!ctx.fullName) return empty;
  let data: KgResult | null = null;
  try {
    const res = await fetch(
      `${KG}?query=${encodeURIComponent(ctx.fullName)}&limit=3&types=Person&key=${encodeURIComponent(key)}`,
      { headers: { "user-agent": UA, accept: "application/json" } },
    );
    if (!res.ok) return empty;
    data = (await res.json()) as KgResult;
  } catch {
    return empty;
  }
  const tokens = subjectTokens(ctx);
  for (const el of data?.itemListElement ?? []) {
    const r = el.result;
    if (!r?.name || !kgNameOverlap(ctx.fullName, r.name)) continue;
    if (!(r["@type"] ?? []).some((t) => /person/i.test(t))) continue;
    const desc = `${r.description ?? ""} ${r.detailedDescription?.articleBody ?? ""}`.trim();
    if (!kgCorroborated(desc, tokens)) continue;
    const facts = [
      `Google Knowledge Graph entity exists for "${r.name}"${r.description ? ` — ${r.description}` : ""}. Google maintains a knowledge panel for them — a notability threshold that's hard to manufacture.`,
    ];
    if (r.detailedDescription?.articleBody) {
      facts.push(`Knowledge Graph detail: "${r.detailedDescription.articleBody.replace(/\s+/g, " ").slice(0, 300)}".`);
    }
    return {
      source: "google-kg",
      facts,
      // Cite a Google URL so the finding nests under the "Knowledge Graph" waterfall
      // step (the detailedDescription.url is usually Wikipedia, which would mis-nest).
      citations: [`https://www.google.com/search?q=${encodeURIComponent(r.name)}`],
      raw: { name: r.name, description: r.description, resultScore: el.resultScore, kgUrl: r.detailedDescription?.url },
    };
  }
  return empty;
}

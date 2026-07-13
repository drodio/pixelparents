// OpenAlex enricher — KEYLESS (polite pool via mailto). Searches authors by name,
// keeps name-matching results with a meaningful footprint, and reports h-index,
// citations, work count, and research areas.

import type { EnricherContext, EnrichmentResult } from "../types";
import { ok, noData, errored } from "../types";
import { fetchJson } from "../http";
import { nameOverlaps } from "../identity";

const BASE = "https://api.openalex.org";
const MAILTO = "enrichment@gopixel.org";

type Author = {
  id?: string;
  display_name?: string;
  orcid?: string;
  works_count?: number;
  cited_by_count?: number;
  summary_stats?: { h_index?: number; i10_index?: number };
  topics?: Array<{ display_name?: string }>;
  last_known_institutions?: Array<{ display_name?: string }>;
};
type Resp = { results?: Author[] };

export async function enrichWithOpenAlex(ctx: EnricherContext): Promise<EnrichmentResult> {
  try {
    if (!ctx.fullName) return noData("openalex", "No subject name to search");
    const resp = await fetchJson<Resp>(
      `${BASE}/authors?search=${encodeURIComponent(ctx.fullName)}&per_page=5&mailto=${MAILTO}`,
    );
    const matches = (resp?.results ?? []).filter((a) => nameOverlaps(ctx.fullName, a.display_name));
    const best = matches.sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))[0];
    if (!best) return noData("openalex", "No matching author");

    // Meaningful-footprint gate (avoid attributing a common-name false positive).
    if ((best.works_count ?? 0) < 3 || (best.cited_by_count ?? 0) < 50) {
      return noData("openalex", "Matched author has too small a research footprint to attribute");
    }

    const h = best.summary_stats?.h_index ?? 0;
    const facts = [
      `OpenAlex: ${best.display_name} — h-index ${h}, ${(best.cited_by_count ?? 0).toLocaleString("en-US")} citations across ${best.works_count} works.`,
    ];
    const areas = (best.topics ?? []).map((t) => t.display_name).filter(Boolean).slice(0, 5);
    if (areas.length) facts.push(`Research areas: ${areas.join(", ")}.`);
    const inst = best.last_known_institutions?.[0]?.display_name;
    if (inst) facts.push(`Affiliation: ${inst}.`);
    const i10 = best.summary_stats?.i10_index;
    if (i10) facts.push(`i10-index: ${i10} (papers with ≥10 citations).`);

    const citations = [best.id, best.orcid].filter((x): x is string => Boolean(x));
    return ok("openalex", facts, citations, {
      id: best.id,
      h_index: h,
      cited_by_count: best.cited_by_count,
      works_count: best.works_count,
      areas,
    });
  } catch (e) {
    return errored("openalex", `OpenAlex lookup failed: ${(e as Error)?.message ?? "unknown"}`);
  }
}

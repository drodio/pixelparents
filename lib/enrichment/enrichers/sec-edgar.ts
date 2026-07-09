// SEC EDGAR enricher — KEYLESS, but the SEC requires a contact email in the
// User-Agent (it 403s otherwise). Searches the full-text filing index for the
// subject's name on Form D (exempt securities offerings) — an authoritative
// fundraising signal when a named related person matches.

import type { EnricherContext, EnrichmentResult } from "../types";
import { ok, noData, errored } from "../types";
import { fetchJson } from "../http";
import { nameOverlaps } from "../identity";

const FTS = "https://efts.sec.gov/LATEST/search-index";
// SEC politeness policy: UA MUST identify the app + a contact email.
const SEC_UA = "pixelparents-enrichment/1.0 (enrichment@gopixel.org)";

type FtsResp = {
  hits?: {
    total?: { value?: number };
    hits?: Array<{
      _source?: { display_names?: string[]; file_date?: string; root_forms?: string[] };
    }>;
  };
};

export async function enrichWithSecEdgar(ctx: EnricherContext): Promise<EnrichmentResult> {
  try {
    if (!ctx.fullName) return noData("sec-edgar", "No subject name to search");

    const resp = await fetchJson<FtsResp>(
      `${FTS}?q=${encodeURIComponent(`"${ctx.fullName}"`)}&forms=D`,
      { headers: { "user-agent": SEC_UA } },
    );
    const hits = resp?.hits?.hits ?? [];
    // Keep only filings whose display_names corroborate the subject's name.
    const matching = hits.filter((h) =>
      (h._source?.display_names ?? []).some((n) => nameOverlaps(ctx.fullName, n)),
    );
    if (matching.length === 0) return noData("sec-edgar", "No matching SEC Form D filings");

    const entities = [
      ...new Set(matching.flatMap((h) => h._source?.display_names ?? [])),
    ].slice(0, 3);
    const dates = matching.map((h) => h._source?.file_date).filter(Boolean).sort().reverse();

    const facts = [
      `SEC Form D (authoritative exempt-offering filings): ${ctx.fullName} appears as a named related person on ${matching.length} filing(s)${dates[0] ? `, most recent ${dates[0]}` : ""}.`,
    ];
    if (entities.length) facts.push(`Associated filers: ${entities.join("; ")}.`);

    return ok("sec-edgar", facts, ["https://www.sec.gov/cgi-bin/srqsb?text=" + encodeURIComponent(ctx.fullName)], {
      filing_count: matching.length,
      entities,
      most_recent: dates[0] ?? null,
    });
  } catch (e) {
    return errored("sec-edgar", `SEC EDGAR lookup failed: ${(e as Error)?.message ?? "unknown"}`);
  }
}

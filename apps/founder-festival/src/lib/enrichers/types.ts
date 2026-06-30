import type { ExaUsage } from "../exa-cost";

// Shared shape across all enrichment sources. Each enricher contributes a
// labeled list of facts (rendered into the Claude prompt) plus citation URLs
// (rendered into the Score Detail debug view) and optional raw payload (kept
// in evaluations.profile.enrichments[] for inspection).
export type EnrichmentResult = {
  source:
    | "github"
    | "producthunt"
    | "wikipedia"
    | "yc"
    | "exa-domain"
    | "nfx"
    | "neo"
    | "devto"
    // Founder-signals wave 1 (free / keyless data sources).
    | "hackernews"
    | "sec-edgar"
    | "stackoverflow"
    | "npm"
    | "huggingface"
    | "wikidata"
    | "openalex"
    // Kaggle — published datasets/notebooks + community votes (data-science/ML depth).
    | "kaggle"
    // crates.io — published Rust packages + downloads (OSS builder, keyed off GitHub login).
    | "crates"
    // Tranco — independent domain-popularity rank (cross-checks Majestic Million reach).
    | "tranco"
    // Curated active-LLM-user leaderboard (https://tkmx.odio.dev).
    | "hn-tokenmaxxing"
    // Libraries.io SourceRank — composite OSS reputation (free, keyed).
    | "librariesio"
    // Google Knowledge Graph — notability threshold (free w/ Google API key).
    | "google-kg"
    // YouTube — talk/interview/media reach (free w/ Google API key).
    | "youtube"
    // BrightData — structured LinkedIn (reach, experience) by URL (keyed, paid).
    | "brightdata"
    // BrightData Crunchbase — authoritative company data (funding, exits,
    // employees, web traffic, app downloads) for the subject's company.
    | "crunchbase"
    // BrightData LinkedIn Company — company scale + follower reach.
    | "linkedin-company"
    // BrightData Crunchbase Person — board/advisor roles + press (investor/operator).
    | "crunchbase-person"
    // USPTO patents — granted/filed patents naming the subject as inventor (technical).
    | "patents"
    // BrightData X/Twitter — follower reach + verified (distribution).
    | "twitter"
    // Personal website — homepage/about scrape (title, meta, headings, socials).
    | "website";
  // Human-readable bullets that Claude reads as additional signal.
  facts: string[];
  // Citation URLs supporting those facts.
  citations: string[];
  // Whether the enricher ran, was intentionally skipped (no credential), found
  // nothing, or errored. Surfaced in the UI so a viewer sees the FULL roster of
  // sources and which ran vs. which need a key — instead of empty results being
  // silently dropped. Optional for backward compatibility: enrichers that don't
  // set it have a status DERIVED via deriveStatus() (facts → "ok", else "no_data").
  status?: EnrichmentStatus;
  // Short human-readable explanation for a non-"ok" status (e.g. "API key not set").
  note?: string;
  // Raw payload for debugging; included verbatim in Score Detail.
  raw?: unknown;
  // Exa cost incurred by this enricher (only exa-domain uses Exa today). Other
  // enrichers leave it undefined; runEnrichments treats that as zero.
  exaUsage?: ExaUsage;
};

// Per-source run status. "ok" = produced facts; "no_api_key" = a required
// credential env var is missing so the enricher skipped FAST (visible,
// intentional); "no_data" = ran but found nothing about the subject; "error" =
// threw / timed out. Only "ok" results feed downstream scoring consumers; all
// are surfaced in the profile "data sources" roster.
export type EnrichmentStatus = "ok" | "no_api_key" | "no_data" | "error";

// A compact, persistable summary of one enricher's run, stored on the profile
// (profile.enrichmentStatuses) so the UI can render the full source roster.
export type EnrichmentStatusEntry = {
  source: EnrichmentResult["source"];
  status: EnrichmentStatus;
  note?: string;
  factCount: number;
};

// Resolve an EnrichmentResult's effective status. Honors an explicit status when
// the enricher set one; otherwise DERIVES it (facts present → "ok", else
// "no_data") so older enrichers stay backward compatible.
export function deriveStatus(r: Pick<EnrichmentResult, "status" | "facts">): EnrichmentStatus {
  if (r.status) return r.status;
  return r.facts.length > 0 ? "ok" : "no_data";
}

// Build the compact, persistable status entry for one result.
export function toStatusEntry(r: EnrichmentResult): EnrichmentStatusEntry {
  const status = deriveStatus(r);
  return { source: r.source, status, note: r.note, factCount: r.facts.length };
}

// Common context passed to every enricher.
export type EnricherContext = {
  linkedinUrl: string;
  linkedinHandle: string; // the "in/<handle>" portion
  linkedinPageText: string;
  // Existing Exa search highlights — enrichers may scan these for usernames,
  // company names, or auxiliary URLs.
  searchHighlights: Array<{ url: string; title?: string; highlights: string[] }>;
  // Person's name once extracted (best-effort). NOTE: this is derived live from
  // the LinkedIn page / search highlights, so for someone whose LinkedIn DISPLAY
  // name is a vanity handle (e.g. "DROdio") it is NOT their legal name.
  fullName: string | null;
  // The canonical/legal name already on the evaluation row from a prior scoring
  // (the LLM's `scoring.fullName`, e.g. "Daniel Rubén Odio"). Present on RE-scores,
  // null on first scores. Identity-critical enrichers (patents) prefer whichever of
  // {fullName, knownFullName} actually parses into a first+last name.
  knownFullName?: string | null;
  // Async BrightData enrichment facts cached on the evaluation by the sweep, keyed
  // by dataset (crunchbaseCompany / linkedinCompany / crunchbasePerson / …). The
  // per-dataset enrichers EMIT these — they never fetch live (collections are too
  // slow to block an eval). Empty on a fresh eval. See bd-async.ts.
  bdAsync?: Record<string, { data?: { facts: string[]; raw: unknown } } | undefined> | null;
  // The subject's personal website. Preferred source is the claimed user's
  // self-entered `websiteUrl`; the website enricher also falls back to any website
  // URL discovered on the LinkedIn/identity surface. Null/absent when unknown.
  websiteUrl?: string | null;
};

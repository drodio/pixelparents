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
    | "twitter";
  // Human-readable bullets that Claude reads as additional signal.
  facts: string[];
  // Citation URLs supporting those facts.
  citations: string[];
  // Raw payload for debugging; included verbatim in Score Detail.
  raw?: unknown;
  // Exa cost incurred by this enricher (only exa-domain uses Exa today). Other
  // enrichers leave it undefined; runEnrichments treats that as zero.
  exaUsage?: ExaUsage;
};

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
};

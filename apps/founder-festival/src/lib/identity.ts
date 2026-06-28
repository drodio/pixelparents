// Clean, structured identity block persisted at evaluations.profile.identity.
//
// Most of this data is ALREADY fetched during scoring (the LLM reads the full
// LinkedIn page; the NFX / GitHub / Wikidata / Wikipedia / SEC enrichers fetch
// far more than they keep). Historically we discarded it into a debug-only
// `raw` blob and guessed "company" from a domain at read time. buildIdentity()
// promotes the reliable subset into one normalized object via a priority merge
// of (1) the LLM `identity` output, (2) enricher raw payloads, and (3)
// deterministic fallbacks. It is PURE (no I/O) so it unit-tests cleanly.

import type { EnrichmentResult } from "./enrichers/types";
import type { ExtractedMetrics } from "./scoring";

export type IdentityLocation = {
  city: string | null;
  region: string | null;
  country: string | null;
  // Human-readable join (or the source's own display string when unstructured).
  display: string | null;
};

export type IdentityGithub = {
  username: string;
  followers: number | null;
  topRepo: string | null;
  topRepoStars: number | null;
  activeLast90d: boolean | null;
};

export type IdentityEducation = { institution: string; degree: string | null };

export type IdentityInvestor = {
  firmName: string | null;
  leadsRounds: boolean | null;
  checkSize: { min: number | null; max: number | null; target: number | null } | null;
  stages: string[];
  verticals: string[];
  fundSize: number | null;
  portfolioCount: number | null;
};

export type Identity = {
  companyName: string | null;
  jobTitle: string | null;
  headline: string | null;
  location: IdentityLocation | null;
  websiteUrl: string | null;
  github: IdentityGithub | null;
  education: IdentityEducation[];
  ycBatch: string | null;
  wikipedia: { title: string; url: string } | null;
  investor: IdentityInvestor | null;
  secFilingsCount: number | null;
};

// The `identity` object the scoring model emits (mirrors SCORING_SCHEMA.identity).
export type LlmIdentity = {
  companyName: string | null;
  jobTitle: string | null;
  headline: string | null;
  location: { city: string | null; region: string | null; country: string | null } | null;
  websiteUrl: string | null;
  education: Array<{ institution: string; degree: string | null }>;
};

export type BuildIdentityInput = {
  llm?: LlmIdentity | null;
  enrichments?: EnrichmentResult[];
  extractedMetrics?: Pick<ExtractedMetrics, "ycBatch" | "partnerAtFirm" | "topGithubRepo" | "topGithubRepoStars"> | null;
  primaryCompanyDomain?: string | null;
};

// "airbnb.com" → "Airbnb". Mirrors the read-time helper in profiles-scored.ts /
// leaderboard.ts; this is the LAST-RESORT company-name fallback.
export function companyNameFromDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const root = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]?.split(".")[0];
  return root ? root.charAt(0).toUpperCase() + root.slice(1) : null;
}

function clean(s: unknown): string | null {
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function rawFor(enrichments: EnrichmentResult[] | undefined, source: EnrichmentResult["source"]) {
  const e = enrichments?.find((x) => x.source === source);
  return { raw: asRecord(e?.raw), citations: e?.citations ?? [] };
}

// Parse a free-form "San Francisco, CA, USA" display string into best-effort
// parts. Only used when we have a display string but no structured location.
function parseDisplayLocation(display: string): IdentityLocation {
  const parts = display.split(",").map((p) => p.trim()).filter(Boolean);
  return {
    city: parts[0] ?? null,
    region: parts[1] ?? null,
    country: parts[2] ?? null,
    display,
  };
}

function joinLocation(city: string | null, region: string | null, country: string | null): string | null {
  const j = [city, region, country].filter(Boolean).join(", ");
  return j || null;
}

export function buildIdentity(input: BuildIdentityInput): Identity {
  const { llm, enrichments, extractedMetrics, primaryCompanyDomain } = input;
  const nfx = rawFor(enrichments, "nfx");
  const gh = rawFor(enrichments, "github");
  const wikidata = rawFor(enrichments, "wikidata");
  const wikipedia = rawFor(enrichments, "wikipedia");
  const sec = rawFor(enrichments, "sec-edgar");

  // ---- companyName: LLM → NFX firm → partnerAtFirm → domain ----
  const nfxFirm = clean(nfx.raw?.firm);
  const companyName =
    clean(llm?.companyName) ??
    nfxFirm ??
    clean(extractedMetrics?.partnerAtFirm) ??
    companyNameFromDomain(primaryCompanyDomain);

  // ---- location: LLM structured → NFX display ----
  let location: IdentityLocation | null = null;
  if (llm?.location && (llm.location.city || llm.location.region || llm.location.country)) {
    const city = clean(llm.location.city);
    const region = clean(llm.location.region);
    const country = clean(llm.location.country);
    location = { city, region, country, display: joinLocation(city, region, country) };
  } else {
    const nfxLoc = clean(nfx.raw?.location);
    if (nfxLoc) location = parseDisplayLocation(nfxLoc);
  }

  // ---- websiteUrl: LLM → derived from domain ----
  const domain = clean(primaryCompanyDomain);
  const websiteUrl =
    clean(llm?.websiteUrl) ??
    (domain ? `https://${domain.replace(/^https?:\/\//, "").replace(/\/+$/, "")}` : null);

  // ---- github: from github enricher raw.user (+ extractedMetrics fallback) ----
  let github: IdentityGithub | null = null;
  const ghUser = asRecord(gh.raw?.user);
  const topRepos = Array.isArray(gh.raw?.top_repos) ? (gh.raw!.top_repos as unknown[]) : [];
  const topRepo0 = asRecord(topRepos[0]);
  const username = clean(ghUser?.login);
  if (username) {
    github = {
      username,
      followers: numOrNull(ghUser?.followers),
      topRepo: clean(topRepo0?.name) ?? clean(extractedMetrics?.topGithubRepo),
      topRepoStars: numOrNull(topRepo0?.stars) ?? numOrNull(extractedMetrics?.topGithubRepoStars),
      activeLast90d:
        typeof gh.raw?.pushed_in_last_90d === "number" ? (gh.raw.pushed_in_last_90d as number) > 0 : null,
    };
  }

  // ---- education: LLM → Wikidata ----
  let education: IdentityEducation[] = [];
  if (Array.isArray(llm?.education) && llm!.education.length > 0) {
    education = llm!.education
      .map((e) => ({ institution: clean(e.institution) ?? "", degree: clean(e.degree) }))
      .filter((e) => e.institution);
  } else if (Array.isArray(wikidata.raw?.education)) {
    education = (wikidata.raw!.education as unknown[])
      .map((e) => ({ institution: clean(e) ?? "", degree: null }))
      .filter((e) => e.institution);
  }

  // ---- wikipedia ----
  let wiki: { title: string; url: string } | null = null;
  const wikiTitle = clean(wikipedia.raw?.title);
  if (wikiTitle && wikipedia.citations[0]) wiki = { title: wikiTitle, url: wikipedia.citations[0] };

  // ---- investor: from NFX raw (only when NFX matched) ----
  let investor: IdentityInvestor | null = null;
  if (nfx.raw) {
    const check = asRecord(nfx.raw.check);
    investor = {
      firmName: nfxFirm,
      leadsRounds: typeof nfx.raw.leads_rounds === "boolean" ? nfx.raw.leads_rounds : null,
      checkSize: check
        ? { min: numOrNull(check.min), max: numOrNull(check.max), target: numOrNull(check.target) }
        : null,
      stages: Array.isArray(nfx.raw.stages) ? (nfx.raw.stages as unknown[]).map(String) : [],
      verticals: Array.isArray(nfx.raw.verticals) ? (nfx.raw.verticals as unknown[]).map(String) : [],
      fundSize: numOrNull(nfx.raw.fund_size),
      portfolioCount: numOrNull(nfx.raw.portfolio_count),
    };
  }

  // ---- secFilingsCount ----
  const secIssuers = Array.isArray(sec.raw?.issuers) ? (sec.raw!.issuers as unknown[]).length : null;

  return {
    companyName,
    jobTitle: clean(llm?.jobTitle),
    headline: clean(llm?.headline),
    location,
    websiteUrl,
    github,
    education,
    ycBatch: clean(extractedMetrics?.ycBatch),
    wikipedia: wiki,
    investor,
    secFilingsCount: secIssuers,
  };
}

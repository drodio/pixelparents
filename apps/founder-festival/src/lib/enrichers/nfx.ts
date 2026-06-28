import type { EnricherContext, EnrichmentResult } from "./types";
import { nameOverlaps } from "./identity";
import { getNfxToken } from "../nfx-token-store";

// NFX Signal (signal.nfx.com) is a community-maintained VC + angel-investor
// directory: check size, stages, sectors, portfolio companies, plus quality
// signals like "claimed" (the investor verified their own profile) and
// "leads_rounds". It is our single biggest STRUCTURED investor source.
//
// Data access: NFX has no public API, but signal.nfx.com is a thin client over a
// GraphQL backend at signal-api.nfx.com/graphql (POST, Bearer JWT). We call it
// DIRECTLY — no Apify, no per-call cost. The JWT lives in NFX_SIGNAL_TOKEN
// (copied from a logged-in Signal session; a weekly cron alerts before it
// expires). Two operations, captured + validated from the live site:
//   • InvestorsAutocompleteQuery(name_or_firm, first) → people w/ slug   (search)
//   • InvestorProfileLoad(person_id = slug)           → full profile     (load)
//
// Precision-first (a false attribution is worse than a missing one): a search
// hit is only trusted when its name matches the subject (first AND last token),
// and we upgrade confidence to authoritative when the loaded profile's
// linkedin_url matches the subject's own LinkedIn URL.
//
// Opportunistic + graceful: NFX may rate-limit or invalidate the token at any
// time. Any failure returns an empty result so the rest of the pipeline still
// produces a score. Per the NFX ToS gray-area: we cache per-runtime, fetch one
// profile per eval (not bulk), and back off silently on error.

const GRAPHQL_URL = "https://signal-api.nfx.com/graphql";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

// Trimmed to the fields we render (GraphQL lets us request a subset of the
// validated query). person_id accepts the slug (validated: "stonly-baptiste").
const SEARCH_QUERY = `query InvestorsAutocompleteQuery($name_or_firm: String, $first: Int) {
  investors(name_or_firm: $name_or_firm, first: $first) {
    edges { node { id person { id slug name first_name last_name } firm { id name } } }
  }
}`;

const PROFILE_QUERY = `query InvestorProfileLoad($personId: ID!, $firstInvestmentsOnRecord: Int) {
  investor_profile(person_id: $personId) {
    id
    claimed
    leads_rounds
    person { id slug name first_name last_name linkedin_url }
    stages { id display_name }
    min_investment
    max_investment
    target_investment
    areas_of_interest_freeform
    vote_count
    headline
    location { id display_name }
    firm { id current_fund_size name slug }
    investor_lists { id slug stage_name vertical { id display_name } }
    investments_on_record(first: $firstInvestmentsOnRecord) {
      record_count
      edges { node { id company_display_name total_raised coinvestor_names } }
    }
  }
}`;

type GqlPerson = {
  id?: string;
  slug?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  linkedin_url?: string | null;
};
type SearchResp = {
  data?: { investors?: { edges?: Array<{ node?: { id?: string; person?: GqlPerson; firm?: { name?: string } } }> } };
};
type ProfileResp = {
  data?: {
    investor_profile?: {
      id?: string;
      claimed?: boolean | null;
      leads_rounds?: boolean | null;
      person?: GqlPerson;
      stages?: Array<{ display_name?: string }>;
      min_investment?: string | number | null;
      max_investment?: string | number | null;
      target_investment?: string | number | null;
      areas_of_interest_freeform?: string | null;
      vote_count?: number | null;
      headline?: string | null;
      location?: { display_name?: string } | null;
      firm?: { name?: string; slug?: string; current_fund_size?: string | null } | null;
      investor_lists?: Array<{ stage_name?: string; vertical?: { display_name?: string } }>;
      investments_on_record?: {
        record_count?: number;
        edges?: Array<{ node?: { company_display_name?: string } }>;
      } | null;
    } | null;
  };
};

async function nfxGraphql<T>(token: string, operationName: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  if (!token) return null;
  try {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        accept: "*/*",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        origin: "https://signal.nfx.com",
        "user-agent": BROWSER_UA,
        "x-signal-person-permission-id": "undefined",
      },
      body: JSON.stringify({ operationName, variables, query }),
    });
    if (!res.ok) {
      console.warn(`[nfx] ${operationName} HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[nfx] ${operationName} failed`, err instanceof Error ? err.message : err);
    return null;
  }
}

function toNumber(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : v;
  return isFinite(n) && n > 0 ? n : null;
}

function formatUsd(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n}`;
}

function buildCheckSizeFact(p: NonNullable<ProfileResp["data"]>["investor_profile"]): string | null {
  if (!p) return null;
  const lo = formatUsd(toNumber(p.min_investment));
  const hi = formatUsd(toNumber(p.max_investment));
  const target = formatUsd(toNumber(p.target_investment));
  if (lo && hi) return `Check size: ${lo}–${hi}${target ? ` (target ${target})` : ""}.`;
  if (target) return `Typical check: ${target}.`;
  return null;
}

// LinkedIn URL match → authoritative confirmation this NFX profile is the
// subject. Compares the "in/<handle>" portion case-insensitively.
function linkedinMatches(subjectUrl: string, nfxUrl: string | null | undefined): boolean {
  if (!nfxUrl) return false;
  const handle = (u: string) => u.toLowerCase().match(/\/in\/([a-z0-9-]+)/)?.[1];
  const a = handle(subjectUrl);
  const b = handle(nfxUrl);
  return !!a && a === b;
}

// Derive a "first-last" slug as a fallback when search returns nothing (the
// validated common-case slug shape, e.g. "marc-andreessen").
function fallbackSlug(fullName: string): string | null {
  const parts = fullName.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0]}-${parts[parts.length - 1]}`;
}

// NFX's name_or_firm search is near-exact, so a middle name breaks it (e.g.
// "Daniel Rubén Odio" → 0 hits, but "Daniel Odio" → hits). Search the full name
// first, then a first+last variant (middle tokens dropped). Caller stops at the
// first variant that returns confirmed hits, so this is usually one extra call.
export function nfxSearchTerms(fullName: string): string[] {
  const full = fullName.trim();
  const terms = [full];
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 3) terms.push(`${parts[0]} ${parts[parts.length - 1]}`);
  return [...new Set(terms)];
}

// Ordered, deduped slug candidates to load. The LinkedIn handle goes FIRST: for
// a claimed profile the NFX slug is very often the person's handle (DROdio's IS
// "drodio"), and loading it lets linkedinMatches confirm authoritatively — which
// also beats picking a same-name duplicate the search might return. Then the
// name-confirmed search hits, then the first-last guess. Every candidate is
// still identity-confirmed before acceptance, so precision is preserved.
export function nfxSlugCandidates(opts: {
  searchSlugs: string[];
  fullName: string;
  linkedinHandle?: string | null;
}): string[] {
  const handle = opts.linkedinHandle?.toLowerCase().replace(/[^a-z0-9-]/g, "") || null;
  return [...new Set([handle, ...opts.searchSlugs, fallbackSlug(opts.fullName)].filter(Boolean))] as string[];
}

export async function enrichWithNfx(ctx: EnricherContext): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "nfx", facts: [], citations: [] };
  if (!ctx.fullName) return empty;
  // DB-first (the one-click-refreshed token), env var as the seed/fallback.
  const token = await getNfxToken();
  if (!token) return empty;

  // Step 1: search by name (and a middle-name-dropped variant) for candidate
  // slugs. Keep only people whose name matches the subject on first AND last
  // token. Stop at the first variant that yields a confirmed hit.
  const searchSlugs: string[] = [];
  for (const term of nfxSearchTerms(ctx.fullName)) {
    const search = await nfxGraphql<SearchResp>(token, "InvestorsAutocompleteQuery", SEARCH_QUERY, {
      name_or_firm: term,
      first: 8,
    });
    const hits = (search?.data?.investors?.edges ?? [])
      .map((e) => e.node?.person)
      .filter((p): p is GqlPerson => !!p?.slug && nameOverlaps(ctx.fullName, p?.name));
    for (const h of hits) searchSlugs.push(h.slug!);
    if (searchSlugs.length > 0) break;
  }

  // Candidate slugs: the LinkedIn handle first (often the slug for claimed
  // profiles), then confirmed search hits, then the first-last fallback.
  const slugs = nfxSlugCandidates({
    searchSlugs,
    fullName: ctx.fullName,
    linkedinHandle: ctx.linkedinHandle,
  });
  if (slugs.length === 0) return empty;

  // Step 2: load the profile for the best candidate slug.
  let profile: NonNullable<ProfileResp["data"]>["investor_profile"] = null;
  let slug = "";
  for (const cand of slugs.slice(0, 3)) {
    const resp = await nfxGraphql<ProfileResp>(token, "InvestorProfileLoad", PROFILE_QUERY, {
      personId: cand,
      firstInvestmentsOnRecord: 20,
    });
    const pr = resp?.data?.investor_profile;
    // Confirm identity: the loaded profile's person.name must match the subject
    // (the fallback slug could resolve to a same-name stranger). LinkedIn URL
    // match, when present, is authoritative.
    if (pr && (nameOverlaps(ctx.fullName, pr.person?.name) || linkedinMatches(ctx.linkedinUrl, pr.person?.linkedin_url))) {
      profile = pr;
      slug = pr.person?.slug ?? cand;
      break;
    }
  }
  if (!profile) return empty;

  const authoritative = linkedinMatches(ctx.linkedinUrl, profile.person?.linkedin_url);
  const facts: string[] = [];
  const name = profile.person?.name ?? ctx.fullName;
  const firm = profile.firm?.name;
  facts.push(`Listed on NFX Signal as ${name}${firm ? ` (${firm})` : ""}.`);
  if (profile.headline) facts.push(`Headline: "${profile.headline}".`);
  if (profile.claimed) facts.push("NFX profile is claimed (the investor verified it themselves).");
  if (profile.leads_rounds) facts.push("Leads rounds.");
  const checkFact = buildCheckSizeFact(profile);
  if (checkFact) facts.push(checkFact);

  // Stages: prefer the profile's own stages[] array; fall back to the stages
  // implied by the investor_lists they appear on.
  const stages = Array.from(
    new Set(
      [
        ...(profile.stages ?? []).map((s) => s.display_name),
        ...(profile.investor_lists ?? []).map((l) => l.stage_name),
      ].filter((s): s is string => !!s),
    ),
  );
  if (stages.length > 0) facts.push(`Invests at stages: ${stages.join(", ")}.`);

  const verticals = Array.from(
    new Set((profile.investor_lists ?? []).map((l) => l.vertical?.display_name).filter((v): v is string => !!v)),
  );
  if (verticals.length > 0) {
    facts.push(`Sectors: ${verticals.slice(0, 8).join(", ")}${verticals.length > 8 ? ` (+${verticals.length - 8} more)` : ""}.`);
  }

  if (profile.areas_of_interest_freeform && profile.areas_of_interest_freeform.trim()) {
    facts.push(`Stated focus: ${profile.areas_of_interest_freeform.trim().slice(0, 240)}.`);
  }
  if (profile.location?.display_name) facts.push(`Location: ${profile.location.display_name}.`);
  if (profile.vote_count && profile.vote_count > 0) facts.push(`NFX community vote count: ${profile.vote_count}.`);
  if (profile.firm?.current_fund_size) facts.push(`Current fund size (per NFX): ${profile.firm.current_fund_size}.`);

  const portfolio = profile.investments_on_record;
  const portfolioCount = portfolio?.record_count ?? portfolio?.edges?.length ?? 0;
  if (portfolioCount > 0) {
    const companies = (portfolio?.edges ?? [])
      .map((e) => e.node?.company_display_name)
      .filter((c): c is string => !!c)
      .slice(0, 10);
    if (companies.length > 0) {
      facts.push(
        `Portfolio (per NFX, ${portfolioCount} total): ${companies.join(", ")}${
          portfolioCount > companies.length ? ` (+${portfolioCount - companies.length} more)` : ""
        }.`,
      );
    } else {
      facts.push(`${portfolioCount} portfolio companies on record.`);
    }
  }

  return {
    source: "nfx",
    facts,
    citations: [`https://signal.nfx.com/investors/${slug}`],
    raw: {
      slug,
      identity_confidence: authoritative ? "authoritative (linkedin match)" : "name match",
      claimed: profile.claimed ?? null,
      leads_rounds: profile.leads_rounds ?? null,
      check: {
        min: toNumber(profile.min_investment),
        max: toNumber(profile.max_investment),
        target: toNumber(profile.target_investment),
      },
      stages,
      verticals,
      firm: profile.firm?.name ?? null,
      fund_size: profile.firm?.current_fund_size ?? null,
      location: profile.location?.display_name ?? null,
      vote_count: profile.vote_count ?? 0,
      portfolio_count: portfolioCount,
    },
  };
}

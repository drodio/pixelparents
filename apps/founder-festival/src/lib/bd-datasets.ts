import { nameMatches } from "./name-match";
import { domainHostOrNull } from "./domain-normalize";
import {
  crunchbaseSlug,
  corroborateCompany,
  crunchbaseFacts,
  websiteHost,
} from "./enrichers/brightdata-crunchbase";
import type { BrightDataCrunchbaseCompany } from "./brightdata";

// Per-dataset config for the async BrightData enrichment registry (bd-async.ts).
// Each dataset: how to resolve its trigger input from an eval, how to corroborate
// a downloaded record is really the subject's, and how to render facts for the
// scorer. `source` is the EnrichmentResult source (one enricher per dataset reads
// the cached facts); `step` is the waterfall label its findings nest under.

// What a dataset needs from the evaluation row to resolve inputs + corroborate.
export type BdRowCtx = {
  fullName: string | null;
  // evaluations.profile JSON (has primaryCompanyDomain + identity.companyName/websiteUrl).
  profile: unknown;
  // The BrightData LinkedIn enricher's raw record (from profile.enrichments), if any.
  linkedinRaw: LinkedinRaw | null;
  // Already-resolved async data keyed by dataset (for chained datasets, e.g. the
  // Crunchbase PERSON input comes from the Crunchbase COMPANY's founders list).
  bdAsync: Record<string, { data?: { facts: string[]; raw: unknown } } | undefined>;
};

type LinkedinRaw = {
  current_company?: { name?: string | null; company_id?: string | null } | null;
  current_company_name?: string | null;
  // Social/profile links the subject listed on their own LinkedIn (incl. Twitter/X).
  bio_links?: Array<{ link?: string | null; title?: string | null } | string> | null;
};

// The Twitter/X handle the subject listed on their OWN LinkedIn bio links (so it's
// self-asserted — exact identity, no same-name risk). Null if none listed.
export function twitterHandleFromLinkedin(raw: LinkedinRaw | null): string | null {
  for (const l of raw?.bio_links ?? []) {
    const url = typeof l === "string" ? l : (l?.link ?? "");
    const m = url.match(/(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})/i);
    if (m && !/^(home|share|intent|i|search|hashtag)$/i.test(m[1]!)) return m[1]!;
  }
  return null;
}

export type BdDataset = {
  key: string;
  source: string; // EnrichmentResult source
  datasetId: string;
  resolveInput: (ctx: BdRowCtx) => Record<string, unknown> | null;
  corroborate: (rec: Record<string, unknown>, ctx: BdRowCtx) => boolean;
  facts: (rec: Record<string, unknown>) => string[];
};

// ── helpers ─────────────────────────────────────────────────────────────────
function prof(profile: unknown): {
  primaryCompanyDomain?: string | null;
  identity?: { companyName?: string | null; websiteUrl?: string | null } | null;
} {
  return (profile ?? {}) as never;
}
function companyDomain(profile: unknown): string | null {
  return domainHostOrNull(prof(profile).primaryCompanyDomain);
}
function companyName(profile: unknown): string | null {
  return prof(profile).identity?.companyName?.trim() || null;
}
export function subjectHosts(profile: unknown): Set<string> {
  const hosts = new Set<string>();
  const d = companyDomain(profile);
  if (d) hosts.add(d);
  const w = websiteHost(prof(profile).identity?.websiteUrl);
  if (w) hosts.add(w);
  return hosts;
}
function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

// ── LinkedIn Company facts ──────────────────────────────────────────────────
function linkedinCompanyFacts(rec: Record<string, unknown>): string[] {
  const r = rec as {
    name?: string; followers?: number; employees_in_linkedin?: number;
    company_size?: string; founded?: number | string; industries?: string;
    funding?: unknown; slogan?: string;
  };
  const name = r.name ?? "the company";
  const facts: string[] = [];
  const head: string[] = [];
  if (r.employees_in_linkedin) head.push(`${fmt(Number(r.employees_in_linkedin))} employees on LinkedIn`);
  else if (r.company_size) head.push(`${r.company_size} employees`);
  if (r.founded) head.push(`founded ${r.founded}`);
  if (r.industries) head.push(String(r.industries));
  if (head.length) facts.push(`LinkedIn company page — ${name}: ${head.join(", ")} (company scale).`);
  if (r.followers && Number(r.followers) > 0) {
    facts.push(`${name} has ${fmt(Number(r.followers))} LinkedIn company followers (distribution/reach).`);
  }
  return facts;
}

// ── Crunchbase Person facts (investor / operator experience) ────────────────
function crunchbasePersonFacts(rec: Record<string, unknown>): string[] {
  const r = rec as {
    full_name?: string;
    num_current_advisor_roles?: number;
    num_news_articles?: number;
    board_and_advisor_roles?: unknown[];
    past_board_and_advisor_roles?: unknown[];
    current_jobs?: unknown[];
    past_jobs?: unknown[];
  };
  const facts: string[] = [];
  const boards = (r.board_and_advisor_roles?.length ?? 0) + (r.past_board_and_advisor_roles?.length ?? 0);
  if (boards > 0) facts.push(`Crunchbase: holds ${boards} board / advisor role(s) across companies (investor/operator experience).`);
  const advisor = Number(r.num_current_advisor_roles);
  if (Number.isFinite(advisor) && advisor > 0) facts.push(`Crunchbase: ${advisor} current advisor role(s).`);
  const jobs = (r.current_jobs?.length ?? 0) + (r.past_jobs?.length ?? 0);
  if (jobs >= 3) facts.push(`Crunchbase: ${jobs} tracked company roles over their career (operator depth).`);
  const news = Number(r.num_news_articles);
  if (Number.isFinite(news) && news >= 25) facts.push(`Crunchbase: subject of ${fmt(news)} news articles (press notability).`);
  return facts;
}

// ── X/Twitter facts (distribution / reach) ──────────────────────────────────
function twitterFacts(rec: Record<string, unknown>): string[] {
  const r = rec as { profile_name?: string; followers?: number; is_verified?: boolean; posts_count?: number };
  const f = Number(r.followers);
  if (!Number.isFinite(f) || f <= 0) return [];
  const verified = r.is_verified ? " (verified)" : "";
  return [`X/Twitter: ${fmt(f)} followers${verified} — audience reach / distribution.`];
}

// Find the Crunchbase PERSON permalink for the subject from the cached Crunchbase
// COMPANY record's founders list (exact identity — they're a named founder).
function founderPermalink(ctx: BdRowCtx): string | null {
  const company = ctx.bdAsync["crunchbaseCompany"]?.data?.raw as
    | { founders?: Array<{ id?: string | null; value?: string | null }> }
    | undefined;
  if (!company?.founders || !ctx.fullName) return null;
  const hit = company.founders.find((f) => f?.value && nameMatches(ctx.fullName!, String(f.value)));
  return hit?.id ? String(hit.id) : null;
}

// ── THE REGISTRY ────────────────────────────────────────────────────────────
export const BD_DATASETS: BdDataset[] = [
  {
    key: "crunchbaseCompany",
    source: "crunchbase",
    datasetId: "gd_l1vijqt9jfj7olije",
    resolveInput: (ctx) => {
      const d = companyDomain(ctx.profile);
      const slug = d ? crunchbaseSlug(d) : companyName(ctx.profile) ? crunchbaseSlug(companyName(ctx.profile)!) : null;
      return slug ? { url: `https://www.crunchbase.com/organization/${slug}` } : null;
    },
    corroborate: (rec, ctx) =>
      corroborateCompany(
        rec as BrightDataCrunchbaseCompany,
        companyName(ctx.profile) ?? "",
        ctx.fullName,
        subjectHosts(ctx.profile),
      ),
    facts: (rec) => crunchbaseFacts(rec as BrightDataCrunchbaseCompany),
  },
  {
    key: "linkedinCompany",
    source: "linkedin-company",
    datasetId: "gd_l1vikfnt1wgvvqz95w",
    resolveInput: (ctx) => {
      const id = ctx.linkedinRaw?.current_company?.company_id;
      return id ? { url: `https://www.linkedin.com/company/${id}` } : null;
    },
    // Exact identity: the company_id came from the subject's OWN LinkedIn current_company.
    corroborate: () => true,
    facts: linkedinCompanyFacts,
  },
  {
    key: "crunchbasePerson",
    source: "crunchbase-person",
    datasetId: "gd_mnx2txa59pcroghrl",
    resolveInput: (ctx) => {
      const permalink = founderPermalink(ctx);
      return permalink ? { url: `https://www.crunchbase.com/person/${permalink}` } : null;
    },
    // Exact identity: the permalink came from the company's founders list, name-matched.
    corroborate: (rec, ctx) =>
      !!ctx.fullName && nameMatches(ctx.fullName, String((rec as { full_name?: string }).full_name ?? "")),
    facts: crunchbasePersonFacts,
  },
  {
    key: "twitter",
    source: "twitter",
    datasetId: "gd_lwxmeb2u1cniijd7t4",
    // EXACT identity: the handle is the one the subject listed on their OWN LinkedIn.
    resolveInput: (ctx) => {
      const h = twitterHandleFromLinkedin(ctx.linkedinRaw);
      return h ? { url: `https://x.com/${h}` } : null;
    },
    corroborate: () => true, // self-listed → trust it (the account exists if it returned facts)
    facts: twitterFacts,
  },
];

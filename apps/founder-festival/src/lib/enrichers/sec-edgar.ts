import type { EnricherContext, EnrichmentResult } from "./types";
import { nameOverlaps } from "./identity";

// SEC EDGAR — free, no key (a descriptive User-Agent with a contact email is
// required or the API 403s). This is the AUTHORITATIVE funding source that fixes
// FEAT-01 (Swapnil's profile guessed $49M from press snippets; the real figure
// was ~$100M). Form D is the legal notice of an exempt securities offering —
// i.e., a private raise — and it names the issuer (company), the dollar amounts,
// and the "related persons" (officers/directors), which is how we tie a raise to
// a specific founder.
//
// Strategy (precision-first): full-text search Form D filings for the subject's
// NAME, group hits by issuer, fetch each issuer's most recent Form D XML, and
// only keep an issuer when the subject actually appears in its related-persons
// list. A founder named on a real SEC filing is a far stronger funding signal
// than an LLM summing press mentions.
//
// Note: EDGAR full-text search covers filings from 2001 onward.

const UA = "founder-festival-eval/1.0 (drodio@storytell.ai)";
const FTS = "https://efts.sec.gov/LATEST/search-index";

type FtsHit = {
  _id: string;
  _source: { display_names?: string[]; file_date?: string; ciks?: string[]; file_type?: string };
};
type FtsResp = { hits?: { total?: { value?: number }; hits?: FtsHit[] } };

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const t = await fetchText(url);
  if (!t) return null;
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}

function formatUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(n % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${n}`;
}

function tagAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]!.trim());
  return out;
}

type FormD = {
  entityName: string | null;
  totalOfferingAmount: number;
  totalAmountSold: number;
  persons: string[];
  // industryGroupType e.g. "Pooled Investment Fund", "Other Banking and
  // Financial Services", "Technology". A pooled/VC/PE fund issuer means the
  // related persons are FUND MANAGERS (investor signal) and the offering amount
  // is the FUND SIZE — not a founder's operating-company raise.
  industryGroup: string | null;
};

// A Form D issuer whose industry group is a pooled investment vehicle. Its
// related persons are GPs/fund managers; its offering amount is fund size.
export function isInvestmentFund(industryGroup: string | null): boolean {
  if (!industryGroup) return false;
  return /pooled investment fund|venture capital|private equity|hedge fund|investing/i.test(industryGroup);
}

function parseFormD(xml: string): FormD {
  const num = (s: string | undefined) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const first = tagAll(xml, "firstName");
  const last = tagAll(xml, "lastName");
  const persons: string[] = [];
  for (let i = 0; i < Math.max(first.length, last.length); i++) {
    const name = [first[i], last[i]].filter(Boolean).join(" ").trim();
    if (name) persons.push(name);
  }
  // industryGroupType lives inside <industryGroup>; some filings repeat it.
  const ig = tagAll(xml, "industryGroupType")[0] ?? null;
  return {
    entityName: tagAll(xml, "entityName")[0] ?? null,
    totalOfferingAmount: num(tagAll(xml, "totalOfferingAmount")[0]),
    totalAmountSold: num(tagAll(xml, "totalAmountSold")[0]),
    persons,
    industryGroup: ig,
  };
}

// IPO check: a company that files annual/quarterly reports (10-K / 10-Q) is, by
// definition, an SEC-reporting public company — a private startup never files
// these — so their presence is the authoritative "has gone public" signal.
//
// We intentionally do NOT also require a recent S-1: for an established public
// company the original IPO S-1 ages out of the submissions "recent" window
// (capped at 1000 filings), and conversely a company that filed an S-1 but
// withdrew it never files 10-K/10-Q. So 10-K/10-Q presence alone is both
// necessary and sufficient. Uses the free submissions API (no key, UA only).
type SubmissionsResp = { filings?: { recent?: { form?: string[] } } };
async function checkIpo(cik: string): Promise<boolean> {
  const padded = cik.padStart(10, "0");
  const data = await fetchJson<SubmissionsResp>(`https://data.sec.gov/submissions/CIK${padded}.json`);
  const forms = data?.filings?.recent?.form ?? [];
  return forms.some((f) => /^10-K|^10-Q/i.test(f));
}

// _id looks like "0001691342-18-000004:primary_doc.xml". Build the archive URL.
function docUrl(hit: FtsHit): string | null {
  const cik = hit._source.ciks?.[0];
  if (!cik) return null;
  const [accession, filename] = hit._id.split(":");
  if (!accession || !filename) return null;
  const cikInt = parseInt(cik, 10);
  const accNoDashes = accession.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDashes}/${filename}`;
}

export type Issuer = {
  entityName: string;
  cik: string;
  // industryGroupType from the issuer's Form D. Drives the founder-vs-investor
  // branch in buildIssuerFacts (a pooled-fund issuer ⇒ the subject is a GP).
  industryGroup: string | null;
  // true if the issuer is an operating company that has since gone public
  // (filed an S-1 and now reports 10-K/10-Q) — an authoritative exit signal.
  isIpo: boolean;
  filings: Array<{ date: string | null; sold: number; offering: number; url: string }>;
};

// Render the human-readable fact line(s) for one confirmed issuer, branching on
// issuer type. A pooled-investment-fund issuer means the subject is a fund
// manager/GP and the offering is FUND SIZE (an investor signal); an operating
// company means a founder raise (and, if it went public, an IPO exit signal).
// Pure so it can be unit-tested without hitting the live SEC API.
export function buildIssuerFacts(iss: Issuer, fullName: string): string[] {
  const mostRecent = iss.filings[0]?.date;
  const dateSuffix = mostRecent ? ` (most recent ${mostRecent}).` : ".";

  if (isInvestmentFund(iss.industryGroup)) {
    // Fund size = the fund's target (totalOfferingAmount); fall back to the
    // committed-to-date figure when the offering is filed as indefinite.
    const offerings = iss.filings.map((f) => f.offering).filter((n) => n > 0);
    const sold = iss.filings.map((f) => f.sold).filter((n) => n > 0);
    const size = offerings.length > 0 ? Math.max(...offerings) : sold.length > 0 ? Math.max(...sold) : 0;
    return [
      `SEC Form D (authoritative filing): ${fullName} is a named related person (fund manager / GP) on ` +
        `${iss.entityName}, a pooled investment fund` +
        (size > 0 ? `, fund size ${formatUsd(size)}` : "") +
        dateSuffix,
    ];
  }

  const sold = iss.filings.map((f) => f.sold).filter((n) => n > 0);
  const maxSold = sold.length > 0 ? Math.max(...sold) : 0;
  const count = iss.filings.length;
  const facts = [
    `SEC Form D (authoritative filing): ${fullName} is a named related person on ` +
      `${count >= 2 ? `${count} exempt-offering filings` : "an exempt-offering filing"} by ${iss.entityName}` +
      (maxSold > 0 ? `, largest offering ${formatUsd(maxSold)} sold` : "") +
      dateSuffix,
  ];
  if (iss.isIpo) {
    facts.push(
      `SEC filings (authoritative): ${iss.entityName} has gone public — it filed an S-1 registration ` +
        `and now files public 10-K/10-Q reports, an authoritative IPO/exit signal for ${fullName}.`,
    );
  }
  return facts;
}

export async function enrichWithSecEdgar(ctx: EnricherContext): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "sec-edgar", facts: [], citations: [] };
  if (!ctx.fullName) return empty;

  const fts = await fetchJson<FtsResp>(
    `${FTS}?q=%22${encodeURIComponent(ctx.fullName)}%22&forms=D`,
  );
  const hits = fts?.hits?.hits ?? [];
  if (hits.length === 0) return empty;

  // Group hits by issuer CIK.
  const byCik = new Map<string, FtsHit[]>();
  for (const h of hits) {
    const cik = h._source.ciks?.[0];
    if (!cik) continue;
    const arr = byCik.get(cik) ?? [];
    arr.push(h);
    byCik.set(cik, arr);
  }

  const issuers: Issuer[] = [];
  let xmlFetches = 0;
  for (const [cik, group] of byCik) {
    if (issuers.length >= 3 || xmlFetches >= 6) break;
    // Most-recent filings first.
    group.sort((a, b) => (b._source.file_date ?? "").localeCompare(a._source.file_date ?? ""));
    let entityName =
      group[0]!._source.display_names?.[0]?.replace(/\s*\(CIK.*$/, "").trim() ?? "";
    let confirmed = false;
    let industryGroup: string | null = null;
    const filings: Issuer["filings"] = [];
    for (const h of group.slice(0, 2)) {
      if (xmlFetches >= 6) break;
      const url = docUrl(h);
      if (!url) continue;
      const xml = await fetchText(url);
      xmlFetches++;
      if (!xml) continue;
      const parsed = parseFormD(xml);
      if (parsed.entityName) entityName = parsed.entityName;
      if (parsed.industryGroup) industryGroup = parsed.industryGroup;
      // Precision gate: the subject must actually be a related person.
      if (parsed.persons.some((p) => nameOverlaps(ctx.fullName, p))) confirmed = true;
      filings.push({
        date: h._source.file_date ?? null,
        sold: parsed.totalAmountSold,
        offering: parsed.totalOfferingAmount,
        url,
      });
    }
    if (confirmed && filings.length > 0) {
      // IPO check only for operating companies — a fund's "S-1" would be a
      // different vehicle, and the extra submissions fetch isn't worth it there.
      const isIpo = isInvestmentFund(industryGroup) ? false : await checkIpo(cik);
      issuers.push({ entityName, cik, industryGroup, isIpo, filings });
    }
  }

  if (issuers.length === 0) return empty;

  const facts: string[] = [];
  const citations: string[] = [];
  for (const iss of issuers) {
    facts.push(...buildIssuerFacts(iss, ctx.fullName));
    citations.push(...iss.filings.map((f) => f.url));
  }

  return {
    source: "sec-edgar",
    facts,
    citations,
    raw: {
      issuers: issuers.map((i) => ({
        entity: i.entityName,
        cik: i.cik,
        industry_group: i.industryGroup,
        is_investment_fund: isInvestmentFund(i.industryGroup),
        is_ipo: i.isIpo,
        filings: i.filings.map((f) => ({ date: f.date, amount_sold: f.sold, offering: f.offering })),
      })),
    },
  };
}

import { getExaClient } from "./exa";
import { addExaUsage, emptyExaUsage, searchUsage, type ExaUsage } from "./exa-cost";
import { nameMatches, nameTokens } from "./name-match";

export type FoundCandidate = {
  handle: string;
  url: string;
  // Raw Exa page title (kept for debug / back-compat).
  title: string;
  // Parsed display name (the part of the title before the headline).
  name: string;
  // Parsed headline / role line, e.g. "GTM @ Crunchbase | Marketing, Sales".
  // Falls back to a trimmed snippet when the title has no headline segment.
  headline: string;
  snippet: string;
};

// Number of results requested from the handle-resolution search. Kept here so
// the cost accounting uses the same count we request. 10 is the most that's
// included in Exa's base search price, and improves recall of the /in/ profile
// among posts/articles.
const HANDLE_SEARCH_NUM_RESULTS = 10;

function extractHandle(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/in\/([^/]+)\/?$/i);
    if (!m) return null;
    return decodeURIComponent(m[1]).toLowerCase();
  } catch {
    return null;
  }
}

// Split a LinkedIn page <title> into { name, headline }. LinkedIn titles look
// like "First Last - Headline goes here | LinkedIn" (the " - " separates the
// name from the headline; the "| LinkedIn" suffix is boilerplate). When there's
// no headline segment we return the whole thing as the name and "" headline.
function splitTitle(rawTitle: string): { name: string; headline: string } {
  const cleaned = (rawTitle ?? "")
    .replace(/\s*[-|–—]\s*LinkedIn\b.*$/i, "")
    .trim();
  // First " - "/"–"/"—" delimiter separates name from headline.
  const m = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (m) return { name: m[1].trim(), headline: m[2].trim() };
  return { name: cleaned, headline: "" };
}

// Derive a clean one-line headline from Exa's crawled page text. The text comes
// back as markdown that starts with "# <Name>" then the headline line, e.g.:
//   "# Peter Cho\n\nGTM @ Crunchbase | Marketing, Sales\n\n## About\n..."
// We strip markdown links, drop the name header + obvious meta/location lines,
// and return the first real content line.
function headlineFromText(text: string): string {
  if (!text) return "";
  const lines = text
    // [label](url) → label
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (l.startsWith("#")) {
      // "# Peter Cho - GTM @ Crunchbase..." sometimes carries the headline on
      // the same line as the name header — reuse splitTitle on it.
      const { headline } = splitTitle(l.replace(/^#+\s*/, ""));
      if (headline) return headline.slice(0, 160);
      continue; // bare "# Name" header — keep scanning for the headline line
    }
    if (/\bconnections?\b|\bfollowers?\b/i.test(l)) continue; // "500 connections • …"
    if (/\((?:US|UK|[A-Z]{2})\)\s*$/.test(l)) continue; // trailing "(US)" location line
    return l.slice(0, 160);
  }
  return "";
}

type RawResult = { url: string; title?: string; text?: string };

// One handle-resolution search. Strategy (tuned against real Exa behavior):
//   • category: "people"   — Exa's people-entity index has far better recall of
//     same-name LinkedIn profiles than a plain web search (it found the correct
//     "Peter Cho @ Crunchbase" that every other variant missed).
//   • NO includeDomains    — counterintuitively, pinning to linkedin.com HURTS
//     recall under category:people (it dropped the correct profile). Non-
//     LinkedIn results are filtered out downstream by extractHandle anyway.
//   • contents text        — so each result carries the headline to display.
// (We do NOT use includeText: LinkedIn pages are login-gated, so Exa's crawled
// page text is sparse and an includeText filter removes essentially everything.)
async function runHandleSearch(
  query: string,
): Promise<{ results: RawResult[]; exaUsage: ExaUsage }> {
  const exa = getExaClient();
  const res = (await exa.search(query, {
    type: "auto",
    numResults: HANDLE_SEARCH_NUM_RESULTS,
    category: "people",
    contents: { text: { maxCharacters: 500 } },
  } as Parameters<typeof exa.search>[1])) as unknown as {
    results?: RawResult[];
    costDollars?: { total?: number };
  };
  return {
    results: res.results ?? [],
    exaUsage: searchUsage(HANDLE_SEARCH_NUM_RESULTS, res.costDollars?.total),
  };
}

function toCandidates(results: RawResult[], limit: number): FoundCandidate[] {
  const seen = new Set<string>();
  const candidates: FoundCandidate[] = [];
  for (const r of results) {
    const handle = extractHandle(r.url);
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    const rawTitle = (r.title ?? "").trim();
    const fromTitle = splitTitle(rawTitle);
    const text = r.text ?? "";
    // Prefer the headline parsed from the title; fall back to one derived from
    // the crawled page text when the title is just a bare name.
    const headline = fromTitle.headline || headlineFromText(text);
    candidates.push({
      handle,
      url: `https://linkedin.com/in/${handle}`,
      title: rawTitle.replace(/\s*\|\s*LinkedIn\s*$/i, "").trim() || handle,
      name: fromTitle.name || handle,
      headline,
      snippet: text.replace(/\s+/g, " ").slice(0, 200).trim(),
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}

// Exa-backed search for a person's LinkedIn profile by name + optional company.
// Returns up to `limit` deduplicated candidates ordered by Exa's relevance
// (empty if nothing matches), plus the real Exa cost incurred. The short-name
// guard returns before any Exa call, so its usage is zero.
//
// The company term is folded into the query string (not a hard filter) so it
// boosts the right person to the top WITHOUT excluding everyone when it's
// mistyped. We no longer append "founder profile" — that biased ranking toward
// founders and buried non-founder profiles (GTM, eng, etc.). When a company
// search yields nothing we retry name-only as a safety net.
export async function findLinkedinHandles(
  name: string,
  company?: string,
  limit = 5,
): Promise<{ candidates: FoundCandidate[]; exaUsage: ExaUsage }> {
  if (!name || name.trim().length < 2) return { candidates: [], exaUsage: emptyExaUsage() };
  const trimmedName = name.trim();
  const trimmedCompany = (company ?? "").trim();
  const query = trimmedCompany ? `${trimmedName} ${trimmedCompany}` : trimmedName;

  const first = await runHandleSearch(query);
  let candidates = toCandidates(first.results, limit);
  let exaUsage = first.exaUsage;

  // Safety net: company-qualified search found nothing — retry name-only so the
  // user still sees matches and can disambiguate via the View links.
  if (candidates.length === 0 && trimmedCompany) {
    const second = await runHandleSearch(trimmedName);
    candidates = toCandidates(second.results, limit);
    exaUsage = addExaUsage(exaUsage, second.exaUsage);
  }

  return { candidates, exaUsage };
}

// The best NAME-VALIDATED candidate URL (or null if none match), plus the Exa
// cost of the resolution search so callers (the bulk cron) can bill it.
//
// We pull several candidates and pick the first whose parsed display name
// plausibly matches the searched person (see nameMatches). This avoids blindly
// accepting Exa's top result when it's a same-search-but-different-person profile
// (e.g. "Sergey E" surfacing for a "Garry Tan" search). Returning null — no
// handle — is better than persisting a wrong one. Pulling 5 instead of 1 is free
// (one Exa search either way); it just lets a correct #2/#3 win over a wrong #1.
export async function resolveLinkedinUrl(
  name: string,
  company?: string,
  email?: string,
): Promise<{ url: string | null; exaUsage: ExaUsage }> {
  const { candidates, exaUsage } = await findLinkedinHandles(name, company, 5);
  const match = pickResolvedCandidate(name, candidates, { company, email });
  return { url: match?.url ?? null, exaUsage };
}

// Free/anonymized email hosts carry no company signal.
const FREE_EMAIL_HOST =
  /^(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|icloud|me|mac|proton|protonmail|aol|gmx|hey|pm|zoho|fastmail|qq|163|126)\./i;

// The brand token of an email's domain — the corroboration signal that the
// resolved LinkedIn is the RIGHT same-named person. "mayank@pulse.qa" → "pulse",
// "x@gentrace.ai" → "gentrace". Null for free providers, Apple relays, or junk.
export function emailDomainBrand(email?: string | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain.includes(".")) return null;
  if (FREE_EMAIL_HOST.test(domain) || /privaterelay\.appleid\.com$/.test(domain)) return null;
  const brand = domain.split(".")[0];
  return brand && brand.length >= 2 ? brand : null;
}

// Generic company words that don't disambiguate one person from another.
const COMPANY_STOPWORDS = new Set([
  "the", "and", "inc", "llc", "ltd", "co", "company", "corp", "corporation",
  "group", "labs", "lab", "ai", "io", "app", "tech", "technologies",
  "technology", "systems", "ventures", "capital", "partners", "global",
]);

function corroborationNeedles(ctx: { company?: string; email?: string | null }): string[] {
  const out: string[] = [];
  if (ctx.company) {
    for (const t of nameTokens(ctx.company)) {
      if (t.length >= 3 && !COMPANY_STOPWORDS.has(t)) out.push(t);
    }
  }
  const brand = emailDomainBrand(ctx.email);
  if (brand && brand.length >= 3) out.push(brand);
  return out;
}

function corroborates(c: FoundCandidate, needles: string[]): boolean {
  if (needles.length === 0) return false;
  const hay = `${c.name} ${c.headline} ${c.snippet} ${c.title}`.toLowerCase();
  return needles.some((n) => hay.includes(n));
}

// Pick the LinkedIn candidate to attach for a name-based lookup. Name-gate
// first (reject blatantly-wrong same-search people), then — among survivors —
// PREFER one whose headline/snippet corroborates the provided company or email
// domain. This is the "stricter but automatic" rule: when nothing corroborates
// we still return the top name-match (unchanged behavior), but a same-named
// stranger no longer wins over the person whose context actually matches.
export function pickResolvedCandidate(
  name: string,
  candidates: FoundCandidate[],
  ctx: { company?: string; email?: string | null },
): FoundCandidate | null {
  const passing = candidates.filter((c) => nameMatches(name, c.name));
  if (passing.length === 0) return null;
  const needles = corroborationNeedles(ctx);
  return passing.find((c) => corroborates(c, needles)) ?? passing[0]!;
}

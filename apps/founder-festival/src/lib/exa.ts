import Exa from "exa-js";
import { domainHost } from "./domain-normalize";
import { addExaUsage, contentsUsage, emptyExaUsage, searchUsage, type ExaUsage } from "./exa-cost";
import { fetchEnrichLayerProfileText } from "./enrichlayer";

// We dropped Exa's `outputSchema` after hitting its 10-property cap when we
// added the investor rubric. Now we just fetch deep search highlights and let
// Claude do all the extraction + scoring downstream. Cleaner, no cap.

export type SearchHighlight = { url: string; title?: string; highlights: string[] };

// Number of search results we request from Exa's deep search. Exported because
// the cost accounting (searchUsage) must use the same number we request.
const RESEARCH_NUM_RESULTS = 10;

export type ResearchResult = {
  searchHighlights: SearchHighlight[];
  // Text content fetched directly from the subject's LinkedIn URL via Exa's
  // /contents endpoint. May be empty if the page can't be parsed publicly.
  linkedinPageText: string;
  // Raw search payload kept for the ScoreDetail debug view.
  grounding: unknown;
  // Real Exa cost incurred by this research (1 search + up to 1 content page).
  exaUsage: ExaUsage;
};

export function getExaClient() {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY is not set");
  return new Exa(key);
}

// Fetch the publicly-rendered text content of a LinkedIn profile via Exa's
// `/contents` endpoint. Returns empty string on failure — never throws.
// LinkedIn aggressively gates content behind login, so this is best-effort:
// headline, public posts, and a few experience snippets are usually visible,
// while full work history typically isn't.
// Returns the page text plus the Exa cost of the getContents call. Counts one
// billed page when the request completes (even if the page yields no text);
// counts nothing when the request throws before billing.
async function fetchLinkedinPageText(
  exa: ReturnType<typeof getExaClient>,
  url: string,
): Promise<{ text: string; exaUsage: ExaUsage }> {
  try {
    const res = (await exa.getContents([url], {
      text: { maxCharacters: 10000 },
    })) as unknown as { results?: Array<{ text?: string }>; costDollars?: { total?: number } };
    const first = res.results?.[0];
    // Use the real cost Exa charged for this getContents request.
    return { text: (first?.text ?? "").trim(), exaUsage: contentsUsage(1, res.costDollars?.total) };
  } catch (err) {
    console.warn("fetchLinkedinPageText failed", err);
    return { text: "", exaUsage: emptyExaUsage() };
  }
}

export async function researchLinkedinProfile(linkedinUrl: string): Promise<ResearchResult> {
  const exa = getExaClient();
  // The query intentionally names BOTH the funding/company facts AND prestige /
  // recognition signals. Without the prestige terms the deep search surfaced only
  // funding pages, so the scorer never SAW honors to score (validated: Brian
  // Chesky's 33k-char research blob contained zero award facts despite TIME100 /
  // Forbes coverage) — the PRESTIGE rubric tier was data-starved. Funding recall
  // is robust without these slots (SEC EDGAR + LinkedIn text + structured fields
  // also feed it), so broadening here is safe. numResults stays 10.
  const query = `${linkedinUrl} founder profile investor venture capital companies funding raised exits IPO acquisition portfolio Y Combinator awards honors recognition Forbes Fortune TIME 30-under-30 fellowship Thiel Rhodes MacArthur notable press feature profile`;

  // Parallelize the deep search and the direct LinkedIn content fetch.
  const [searchResult, page] = await Promise.all([
    exa.search(query, {
      type: "deep",
      numResults: RESEARCH_NUM_RESULTS,
      contents: { highlights: true },
    }) as unknown as Promise<{
      results?: Array<{ url: string; title?: string; highlights?: string[] }>;
      costDollars?: { total?: number };
    }>,
    fetchLinkedinPageText(exa, linkedinUrl),
  ]);

  const searchHighlights = (searchResult.results ?? []).map((r) => ({
    url: r.url,
    title: r.title,
    highlights: r.highlights ?? [],
  }));

  // FALLBACK: LinkedIn blocks Exa's content fetch for many profiles (especially
  // niche professionals / investors whose presence is primarily on LinkedIn). When
  // that fetch comes back empty, fetch the structured profile from EnrichLayer (a
  // real LinkedIn data API, no scraping) and use it as the LinkedIn page text — so
  // name extraction, the identity enrichers, and the scorer all have content to work
  // with. Fires ONLY on an empty Exa fetch, so we pay the ~$0.10/call only when
  // needed. (Cannot rescue a profile the user set to PRIVATE — no public API can.)
  let linkedinPageText = page.text;
  let enrichLayerUsed = false;
  if (!linkedinPageText) {
    const el = await fetchEnrichLayerProfileText(linkedinUrl);
    if (el?.text) {
      linkedinPageText = el.text;
      enrichLayerUsed = true;
    }
  }

  return {
    searchHighlights,
    linkedinPageText,
    grounding: { search: searchResult, linkedinPageTextLength: linkedinPageText.length, enrichLayerUsed },
    // Real cost from the search response + the real getContents cost.
    exaUsage: addExaUsage(
      searchUsage(RESEARCH_NUM_RESULTS, searchResult.costDollars?.total),
      page.exaUsage,
    ),
  };
}

// Pull plausible-looking domain mentions out of the highlight texts so we can
// pre-look them up in Majestic Million and pass that context to Claude.
// Domains that HOST other people's profiles / content / press — never a
// founder's OWN company domain. Excluded from Majestic Million candidate
// matching so e.g. a LinkedIn-hosted profile (linkedin.com, MM rank 6) can't
// earn the founder "company in the MM table" bonus. Matched against the
// registrable domain AND any subdomain (news.ycombinator.com → ycombinator.com).
// Deliberately errs toward excluding: a missed legit company-domain bonus is
// recoverable (the founder still scores via role / raise / exits), but a false
// top-rank match is a catastrophic +100. This list is config — tune freely.
const PLATFORM_DOMAINS = new Set<string>([
  // social / profile hosts
  "linkedin.com", "twitter.com", "x.com", "facebook.com", "fb.com", "instagram.com",
  "threads.net", "tiktok.com", "youtube.com", "youtu.be", "medium.com", "substack.com",
  "about.me", "linktr.ee", "gravatar.com", "pinterest.com",
  // code / dev hosts
  "github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com", "stackexchange.com",
  "npmjs.com", "huggingface.co", "kaggle.com", "dev.to",
  // reference
  "wikipedia.org", "wikidata.org", "wikimedia.org",
  // startup / investor directories & aggregators
  "crunchbase.com", "pitchbook.com", "cbinsights.com", "angel.co", "wellfound.com",
  "producthunt.com", "f6s.com", "owler.com", "zoominfo.com", "rocketreach.co",
  "tracxn.com", "golden.com", "ycombinator.com", "signalnfx.com",
  // press
  "techcrunch.com", "forbes.com", "bloomberg.com", "businessinsider.com", "reuters.com",
  "wsj.com", "nytimes.com", "theinformation.com", "venturebeat.com", "cnbc.com",
  // community / search
  "reddit.com", "quora.com", "google.com", "googleusercontent.com",
]);

function isPlatformDomain(d: string): boolean {
  if (PLATFORM_DOMAINS.has(d)) return true;
  for (const p of PLATFORM_DOMAINS) if (d.endsWith("." + p)) return true;
  return false;
}

export function extractCandidateDomains(highlights: SearchHighlight[]): string[] {
  // Matches "sub.host.tld" — captures the full dotted domain so we can strip a
  // leading `www.` afterward (a TLD-only regex would lose the `example.com`
  // tail of `www.example.com`).
  const re = /\b([a-z0-9][a-z0-9-]{0,61}(?:\.[a-z0-9-]{1,63})*\.[a-z]{2,})\b/gi;
  const seen = new Set<string>();
  for (const h of highlights) {
    for (const text of [h.url ?? "", h.title ?? "", ...(h.highlights ?? [])]) {
      const matches = text.match(re);
      if (!matches) continue;
      for (const m of matches) {
        const d = domainHost(m);
        // Skip platform/host/press/aggregator domains — they're never the
        // founder's own company, so they must not earn the MM company bonus.
        if (isPlatformDomain(d)) continue;
        seen.add(d);
      }
    }
  }
  return [...seen].slice(0, 50);
}

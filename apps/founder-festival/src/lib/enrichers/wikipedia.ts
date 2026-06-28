import type { EnricherContext, EnrichmentResult } from "./types";

// Wikipedia REST API — free, no token required.
// Strategy: search Wikipedia for the subject's full name; if a hit exists
// AND the article's extract mentions clearly relevant terms (founder, CEO,
// company, investor, etc.), include it.

const UA = "founder-festival-eval/1.0 (https://festival.so)";

type WikiSearchResult = { query?: { search?: Array<{ title: string; pageid: number; snippet?: string }> } };
type WikiSummary = { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } }; description?: string };

const RELEVANT_TERMS = /founder|co-?founder|ceo|chief executive|investor|venture|angel|entrepreneur|startup|tech executive|programmer|software engineer/i;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function enrichWithWikipedia(ctx: EnricherContext, knownWikiUrls: string[]): Promise<EnrichmentResult> {
  if (!ctx.fullName) return { source: "wikipedia", facts: [], citations: [] };

  // If Exa already pointed at a specific Wikipedia URL, use it directly.
  let summary: WikiSummary | null = null;
  for (const u of knownWikiUrls) {
    const m = u.match(/\/wiki\/([^?#]+)/);
    if (!m) continue;
    const slug = decodeURIComponent(m[1]!);
    summary = await fetchJson<WikiSummary>(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`,
    );
    if (summary) break;
  }

  // Otherwise search by name.
  if (!summary) {
    const search = await fetchJson<WikiSearchResult>(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(ctx.fullName)}&srlimit=3&format=json&origin=*`,
    );
    const hits = search?.query?.search ?? [];
    for (const hit of hits) {
      const candidate = await fetchJson<WikiSummary>(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`,
      );
      if (candidate && (candidate.extract ?? "").toLowerCase().includes(ctx.fullName.toLowerCase())) {
        summary = candidate;
        break;
      }
    }
  }

  if (!summary?.extract) return { source: "wikipedia", facts: [], citations: [] };
  // Confidence gate: only count if the article looks like it's about a tech / business person.
  if (!RELEVANT_TERMS.test(summary.extract)) return { source: "wikipedia", facts: [], citations: [] };

  const url = summary.content_urls?.desktop?.page;
  // Pageview MAGNITUDE: a page that gets 50k views/month means the person is
  // genuinely widely known (vs. a barely-visited stub). Trailing ~12 months.
  const avgViews = await fetchMonthlyPageviews(summary.title ?? ctx.fullName);
  const facts = [
    `Wikipedia page exists for "${summary.title ?? ctx.fullName}" — strong notability signal.`,
    summary.description ? `Wikipedia description: ${summary.description}` : "",
    pageviewsFact(avgViews) ?? "",
    `Summary excerpt: "${summary.extract.replace(/\s+/g, " ").slice(0, 600)}".`,
  ].filter(Boolean);

  return {
    source: "wikipedia",
    facts,
    citations: url ? [url] : [],
    raw: {
      title: summary.title,
      description: summary.description,
      extract_length: summary.extract.length,
      avg_monthly_pageviews: avgViews,
    },
  };
}

// Average monthly pageviews over the trailing ~12 months (Wikimedia REST metrics,
// keyless). Returns null on miss. The title must use underscores for spaces.
async function fetchMonthlyPageviews(title: string): Promise<number | null> {
  const article = encodeURIComponent(title.replace(/ /g, "_"));
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86400 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const data = await fetchJson<{ items?: Array<{ views?: number }> }>(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${article}/monthly/${fmt(start)}/${fmt(end)}`,
  );
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return Math.round(items.reduce((s, i) => s + (i.views ?? 0), 0) / items.length);
}

// Pure: the pageview fact string (or null below the noise floor). Exported for tests.
export function pageviewsFact(avgViews: number | null): string | null {
  if (!avgViews || avgViews < 1000) return null;
  return `Wikipedia page averages ~${avgViews.toLocaleString("en-US")} views/month over the last year — a notability MAGNITUDE signal (how widely known the person is).`;
}

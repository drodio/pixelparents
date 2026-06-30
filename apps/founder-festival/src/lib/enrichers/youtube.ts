import type { EnricherContext, EnrichmentResult } from "./types";
import { extractCompanyNames } from "./extract";

// YouTube Data API v3 (free w/ GOOGLE_API_KEY; quota: search costs 100 units of a
// 10k/day default, so ~100 evals/day touch it before it 403s and no-ops). Surfaces
// talks / interviews / media coverage = thought-leadership reach (by view count).
//
// IDENTITY: name-only YouTube search is the FUZZIEST surface (lots of same-name
// people / unrelated videos), so we gate HARD: we only count a video whose metadata
// (title / description / channel) mentions one of the subject's own COMPANY tokens.
// If we can't extract a company to corroborate against, we skip YouTube entirely
// (precision over recall — a missed talk is recoverable, a wrong-person view count
// is not). No-ops gracefully without the key / on quota errors.

const YT = "https://www.googleapis.com/youtube/v3";
const UA = "founder-festival-eval/1.0";

const GENERIC_CO = new Set([
  "inc", "llc", "ltd", "the", "and", "corp", "group", "labs", "lab", "technologies",
  "technology", "systems", "company", "ventures", "capital", "partners", "holdings",
]);

export function companyTokensFor(linkedinPageText: string): Set<string> {
  const out = new Set<string>();
  for (const name of extractCompanyNames(linkedinPageText ?? "")) {
    for (const t of name.toLowerCase().split(/[^a-z0-9]+/)) {
      if (t.length >= 4 && !GENERIC_CO.has(t)) out.add(t);
    }
  }
  return out;
}

type YtSearchItem = { id?: { videoId?: string }; snippet?: { title?: string; description?: string; channelTitle?: string } };
type YtVideoItem = { id?: string; snippet?: { title?: string }; statistics?: { viewCount?: string } };

// A video is corroborated as the subject's iff its metadata mentions a company token.
export function corroborateVideos(items: YtSearchItem[], tokens: Set<string>): YtSearchItem[] {
  if (tokens.size === 0) return [];
  return items.filter((it) => {
    const meta = `${it.snippet?.title ?? ""} ${it.snippet?.description ?? ""} ${it.snippet?.channelTitle ?? ""}`.toLowerCase();
    return [...tokens].some((t) => meta.includes(t));
  });
}

// Pure: render the reach fact from corroborated videos (with view counts).
export function youtubeFacts(vids: Array<{ title: string; views: number }>): string[] {
  const withViews = vids.filter((v) => v.views > 0).sort((a, b) => b.views - a.views);
  if (withViews.length === 0) return [];
  const total = withViews.reduce((s, v) => s + v.views, 0);
  const top = withViews[0]!;
  return [
    `Appears in ${withViews.length} company-corroborated YouTube video(s) — talks / interviews / coverage — totaling ~${total.toLocaleString("en-US")} views (thought-leadership / media REACH). Top: "${top.title}" (${top.views.toLocaleString("en-US")} views).`,
  ];
}

async function ytJson(path: string): Promise<{ items?: unknown[] } | null> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${YT}${path}&key=${encodeURIComponent(key)}`, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as { items?: unknown[] };
  } catch {
    return null;
  }
}

export async function enrichWithYouTube(ctx: EnricherContext): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "youtube", facts: [], citations: [] };
  if (!process.env.GOOGLE_API_KEY) {
    return { source: "youtube", status: "no_api_key", note: "API key not set", facts: [], citations: [] };
  }
  if (!ctx.fullName) return empty;
  const tokens = companyTokensFor(ctx.linkedinPageText);
  if (tokens.size === 0) return empty; // nothing to corroborate against → skip
  const companies = extractCompanyNames(ctx.linkedinPageText ?? "");
  const q = `${ctx.fullName} ${companies[0] ?? ""}`.trim();
  const search = await ytJson(`/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(q)}`);
  const items = (search?.items ?? []) as YtSearchItem[];
  const corroborated = corroborateVideos(items, tokens).slice(0, 10);
  const ids = corroborated.map((it) => it.id?.videoId).filter((x): x is string => Boolean(x));
  if (ids.length === 0) return empty;
  const stats = await ytJson(`/videos?part=statistics,snippet&id=${encodeURIComponent(ids.join(","))}`);
  const vids = ((stats?.items ?? []) as YtVideoItem[]).map((v) => ({
    title: v.snippet?.title ?? "",
    views: Number(v.statistics?.viewCount ?? 0),
    id: v.id ?? "",
  }));
  const facts = youtubeFacts(vids);
  if (facts.length === 0) return empty;
  const topId = vids.filter((v) => v.views > 0).sort((a, b) => b.views - a.views)[0]?.id;
  return {
    source: "youtube",
    facts,
    citations: topId ? [`https://www.youtube.com/watch?v=${topId}`] : [],
    raw: { query: q, videos: vids.slice(0, 10) },
  };
}

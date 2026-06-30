import type { EnricherContext, EnrichmentResult } from "./types";

// Product Hunt API v2 — GraphQL. Requires a developer token at
// https://api.producthunt.com/v2/oauth/applications (free, instant).
// No-op silently if PRODUCT_HUNT_TOKEN is unset so the eval pipeline still
// works without it.

const PH_ENDPOINT = "https://api.producthunt.com/v2/api/graphql";

async function ph<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  const token = process.env.PRODUCT_HUNT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(PH_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

type UserSearchResult = {
  search: {
    edges: Array<{
      node: {
        id: string;
        name: string;
        username: string;
        url: string;
        headline?: string | null;
        madePosts?: {
          totalCount: number;
          edges: Array<{
            node: {
              name: string;
              tagline?: string;
              votesCount?: number;
              featuredAt?: string | null;
              url: string;
            };
          }>;
        };
      };
    }>;
  };
};

export async function enrichWithProductHunt(ctx: EnricherContext, knownPhUrls: string[]): Promise<EnrichmentResult> {
  if (!process.env.PRODUCT_HUNT_TOKEN) {
    return {
      source: "producthunt",
      status: "no_api_key",
      note: "API key not set",
      facts: [],
      citations: [],
      raw: { skipped: "PRODUCT_HUNT_TOKEN unset" },
    };
  }
  // If we already saw a producthunt.com profile in the Exa data, skip the name
  // search and use the username from that URL.
  const handleFromKnownUrl = knownPhUrls
    .map((u) => u.match(/producthunt\.com\/@([A-Za-z0-9_.-]+)/i)?.[1])
    .find((x): x is string => !!x);

  const searchTerm = handleFromKnownUrl ?? ctx.fullName;
  if (!searchTerm) return { source: "producthunt", facts: [], citations: [] };

  const data = await ph<UserSearchResult>(
    `query Search($q: String!) {
       search(query: $q, types: USER, first: 5) {
         edges {
           node {
             ... on User {
               id name username url headline
               madePosts(first: 10) {
                 totalCount
                 edges { node { name tagline votesCount featuredAt url } }
               }
             }
           }
         }
       }
     }`,
    { q: searchTerm },
  );

  if (!data?.search?.edges?.length) {
    return { source: "producthunt", facts: [], citations: [] };
  }

  // Pick the best match: handle-from-URL exact match, else best name overlap.
  const candidates = data.search.edges.map((e) => e.node).filter((n) => !!n.username);
  let best = candidates[0];
  if (handleFromKnownUrl) {
    best = candidates.find((n) => n.username.toLowerCase() === handleFromKnownUrl.toLowerCase()) ?? best;
  } else if (ctx.fullName) {
    const target = ctx.fullName.toLowerCase().split(/\s+/);
    best = candidates.reduce((acc, cand) => {
      const score = (cand.name?.toLowerCase().split(/\s+/) ?? []).filter((p) => target.includes(p)).length;
      const accScore = (acc.name?.toLowerCase().split(/\s+/) ?? []).filter((p) => target.includes(p)).length;
      return score > accScore ? cand : acc;
    }, candidates[0]!);
  }
  if (!best) return { source: "producthunt", facts: [], citations: [] };

  const facts: string[] = [];
  const citations: string[] = [];
  facts.push(`Product Hunt: @${best.username} (${best.name})${best.headline ? ` — ${best.headline}` : ""}.`);
  citations.push(best.url);

  const posts = best.madePosts?.edges?.map((e) => e.node) ?? [];
  // Sort by upvotes desc so Claude reads the strongest product first.
  const ranked = [...posts].sort((a, b) => (b.votesCount ?? 0) - (a.votesCount ?? 0));
  const featuredCount = ranked.filter((p) => !!p.featuredAt).length;
  if (best.madePosts?.totalCount) {
    facts.push(
      `Maker of ${best.madePosts.totalCount} product launches on Product Hunt` +
        (featuredCount ? ` (${featuredCount} featured on PH homepage).` : "."),
    );
  }
  for (const p of ranked.slice(0, 5)) {
    const votes = p.votesCount ?? 0;
    const featured = p.featuredAt ? " · FEATURED" : "";
    facts.push(`  • ${p.name}${p.tagline ? ` — ${p.tagline}` : ""} (${votes} upvotes${featured})`);
    citations.push(p.url);
  }

  return { source: "producthunt", facts, citations, raw: best };
}

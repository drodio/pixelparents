import type { EnricherContext, EnrichmentResult } from "./types";
import { resolveConfidentGithubUser } from "./github";

// Libraries.io — free with an API key (LIBRARIESIO_API_KEY). Surfaces SourceRank,
// Libraries.io's COMPOSITE open-source reputation score (0–30+: factors in docs,
// contributors, dependents, recency, license, …) — a much harder-to-game signal
// than a raw star count — plus contributor counts. We key off the ALREADY
// confidence-gated GitHub login (resolveConfidentGithubUser), so there's no new
// same-name match surface. No-ops gracefully without the key.

const BASE = "https://libraries.io/api";
const UA = "founder-festival-eval/1.0";

type LibRepo = {
  full_name: string;
  rank?: number; // SourceRank
  stargazers_count?: number;
  contributions_count?: number;
  github_contributions_count?: number;
  fork?: boolean;
};

async function lib(path: string): Promise<unknown | null> {
  const key = process.env.LIBRARIESIO_API_KEY;
  if (!key) return null;
  const sep = path.includes("?") ? "&" : "?";
  try {
    const res = await fetch(`${BASE}${path}${sep}api_key=${encodeURIComponent(key)}`, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const contributorCount = (r: LibRepo): number => r.contributions_count ?? r.github_contributions_count ?? 0;

// Pure: render the repo list into prompt facts. Exported for unit testing.
export function librariesIoFacts(login: string, repos: LibRepo[]): string[] {
  const own = repos.filter((r) => !r.fork && (r.rank ?? 0) > 0).sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0));
  if (own.length === 0) return [];
  const maxRank = Math.max(0, ...own.map((r) => r.rank ?? 0));
  const maxContrib = Math.max(0, ...own.map(contributorCount));
  const facts: string[] = [
    `Libraries.io indexed ${own.length} non-fork repos for @${login}; top SourceRank ${maxRank}, max contributors ${maxContrib}.`,
    `SourceRank is Libraries.io's COMPOSITE OSS-reputation score (0–30+: docs, contributors, dependents, activity) — assess sustained OSS QUALITY from it, distinct from raw star counts:`,
  ];
  for (const r of own.slice(0, 5)) {
    const c = contributorCount(r);
    facts.push(
      `  • ${r.full_name} — SourceRank ${r.rank ?? 0}${r.stargazers_count ? `, ${r.stargazers_count.toLocaleString("en-US")}★` : ""}${c ? `, ${c} contributors` : ""}.`,
    );
  }
  return facts;
}

export async function enrichWithLibrariesIo(ctx: EnricherContext, knownGithubUrls: string[]): Promise<EnrichmentResult> {
  const user = await resolveConfidentGithubUser(ctx, knownGithubUrls);
  if (!user?.login) return { source: "librariesio", facts: [], citations: [] };
  const repos = (await lib(`/github/${encodeURIComponent(user.login)}/repositories?per_page=10&sort=rank`)) as
    | LibRepo[]
    | null;
  if (!Array.isArray(repos) || repos.length === 0) return { source: "librariesio", facts: [], citations: [] };
  const facts = librariesIoFacts(user.login, repos);
  if (facts.length === 0) return { source: "librariesio", facts: [], citations: [] };
  const citations = repos
    .filter((r) => !r.fork && (r.rank ?? 0) > 0)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, 5)
    .map((r) => `https://libraries.io/github/${r.full_name}`);
  return {
    source: "librariesio",
    facts,
    citations,
    raw: { login: user.login, repos: repos.slice(0, 10) },
  };
}

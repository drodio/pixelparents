import type { EnricherContext, EnrichmentResult } from "./types";
import { domainHost } from "@/lib/domain-normalize";

// GitHub REST API — free, unauthenticated 60 req/hr. If GITHUB_TOKEN is set,
// rate limit jumps to 5,000 req/hr. We use the token when present.

const UA = "founder-festival-eval/1.0";

async function gh(path: string): Promise<unknown | null> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    "user-agent": UA,
    accept: "application/vnd.github+json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`https://api.github.com${path}`, { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// GitHub GraphQL (api.github.com/graphql). Unlike REST, GraphQL ALWAYS requires a
// token — so this no-ops gracefully (returns null) when GITHUB_TOKEN is absent,
// and the caller just skips the extra facts. Used for the contribution graph,
// which REST cannot expose.
async function ghGraphQL(query: string): Promise<Record<string, unknown> | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { "user-agent": UA, authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Record<string, unknown> };
    return json?.data ?? null;
  } catch {
    return null;
  }
}

export type GithubContributions = {
  lastYearTotal: number; // all contributions in the trailing 12 months
  commits: number;
  pullRequests: number;
  reviews: number;
  restricted: number; // PRIVATE contributions (count only) — the "ships privately" signal
  reposContributedTo: number; // external repos they don't own
  publicGists: number;
  hasSponsorsListing: boolean;
  sponsors: number;
};

// Pull the contribution graph for an ALREADY-CONFIRMED login (no new identity
// surface — this runs only after githubMatchConfidence accepted the account).
// `contributionsCollection` exposes the trailing-12-month commit/PR/review totals
// AND `restrictedContributionsCount` — the number of PRIVATE contributions, which
// is the exact fix for "a dormant-looking public profile whose owner actually
// ships in private repos every day." REST cannot surface any of this.
export async function fetchGithubContributions(login: string): Promise<GithubContributions | null> {
  const q = `query { user(login: ${JSON.stringify(login)}) {
    contributionsCollection {
      contributionCalendar { totalContributions }
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
    }
    gists(privacy: PUBLIC) { totalCount }
    hasSponsorsListing
    sponsorshipsAsMaintainer { totalCount }
    repositoriesContributedTo(includeUserRepositories: false, contributionTypes: [COMMIT, PULL_REQUEST, PULL_REQUEST_REVIEW]) { totalCount }
  } }`;
  const data = await ghGraphQL(q);
  const u = data?.user as
    | {
        contributionsCollection?: {
          contributionCalendar?: { totalContributions?: number };
          totalCommitContributions?: number;
          totalPullRequestContributions?: number;
          totalPullRequestReviewContributions?: number;
          restrictedContributionsCount?: number;
        };
        gists?: { totalCount?: number };
        hasSponsorsListing?: boolean;
        sponsorshipsAsMaintainer?: { totalCount?: number };
        repositoriesContributedTo?: { totalCount?: number };
      }
    | undefined
    | null;
  const cc = u?.contributionsCollection;
  if (!cc) return null;
  return {
    lastYearTotal: cc.contributionCalendar?.totalContributions ?? 0,
    commits: cc.totalCommitContributions ?? 0,
    pullRequests: cc.totalPullRequestContributions ?? 0,
    reviews: cc.totalPullRequestReviewContributions ?? 0,
    restricted: cc.restrictedContributionsCount ?? 0,
    reposContributedTo: u?.repositoriesContributedTo?.totalCount ?? 0,
    publicGists: u?.gists?.totalCount ?? 0,
    hasSponsorsListing: Boolean(u?.hasSponsorsListing),
    sponsors: u?.sponsorshipsAsMaintainer?.totalCount ?? 0,
  };
}

// Render the contribution-graph signal into prompt facts. Pure (no I/O) so it's
// unit-testable without the network.
export function githubContributionFacts(c: GithubContributions): string[] {
  const facts: string[] = [];
  if (c.lastYearTotal > 0 || c.commits > 0 || c.pullRequests > 0) {
    facts.push(
      `GitHub contributions (trailing 12 months): ${c.lastYearTotal} total — ${c.commits} commits, ${c.pullRequests} PRs, ${c.reviews} code reviews.`,
    );
  }
  if (c.restricted > 0) {
    facts.push(
      `Plus ${c.restricted} PRIVATE/restricted contributions in the last year — actively SHIPS CODE that isn't publicly visible. A public profile that looks dormant can still be a daily builder in private repos; this is direct current-technical-depth evidence.`,
    );
  }
  if (c.reposContributedTo > 0) {
    facts.push(`Contributed commits/PRs/reviews to ${c.reposContributedTo} external repos they don't own — open-source collaborator signal.`);
  }
  if (c.publicGists > 0) {
    facts.push(`${c.publicGists} public gists (code snippets / technical notes).`);
  }
  if (c.hasSponsorsListing) {
    facts.push(`GitHub Sponsors enabled${c.sponsors > 0 ? ` with ${c.sponsors} sponsor(s)` : ""} — recognized open-source maintainer.`);
  }
  return facts;
}

type GhUser = { login: string; name?: string; bio?: string; company?: string | null; location?: string | null; public_repos?: number; followers?: number; created_at?: string };
type GhRepo = { name: string; html_url: string; stargazers_count?: number; description?: string | null; language?: string | null; fork?: boolean; pushed_at?: string };

function guessHandlesFromContext(ctx: EnricherContext, knownUrls: string[]): string[] {
  const handles = new Set<string>();
  // 1. Pull from known github URLs in the Exa data
  for (const u of knownUrls) {
    const m = u.match(/github\.com\/([A-Za-z0-9-]+)/i);
    if (m && m[1] && !/^(orgs|topics|search|trending)$/i.test(m[1])) {
      handles.add(m[1]);
    }
  }
  // NOTE: we deliberately do NOT try the LinkedIn vanity handle as a GitHub
  // username. A LinkedIn handle is not a GitHub handle — when it coincidentally
  // matches a DIFFERENT person's GitHub account who happens to share the full
  // name, we attribute their repos to the wrong person. (Real case: Sir Richard
  // Branson's LinkedIn `/in/rbranson` resolved to github.com/rbranson — a
  // software engineer also named Richard Branson — inflating Sir Richard with a
  // coder's repos. The name-match guard can't separate two real same-named
  // people.) Real github accounts are still found via Exa-surfaced URLs (1) and
  // name-derived handles (below); those go through isConfidentGithubMatch.
  // 2. If we have a fullName, derive obvious handles
  if (ctx.fullName) {
    const name = ctx.fullName.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      handles.add(parts.join("-"));            // jane-doe
      handles.add(parts.join(""));             // janedoe
      handles.add(parts[0]! + parts[parts.length - 1]!); // janedoe
    } else if (parts.length === 1) {
      handles.add(parts[0]!);
    }
  }
  return [...handles].slice(0, 4); // cap probes
}

// How confident are we that a GitHub account belongs to the subject? Returns a
// 0-1 score; the caller accepts at >= GITHUB_MATCH_THRESHOLD. Layered:
//   • COMPANY CORRELATION (strongest, ~certain): the GitHub account's stated
//     company also appears in the subject's own LinkedIn data → 0.95. A company
//     that does NOT appear is evidence of a DIFFERENT same-named person and
//     penalizes the score (real case: Sir Richard Branson @ Virgin Group vs
//     github.com/rbranson — "Rick Branson", company "@openai" — a coder who is
//     not Sir Richard; names alone can't separate two real "Richard Branson"s).
//   • Otherwise a heuristic sum: full first+last name match, plus the GitHub URL
//     being surfaced in the subject's own Exa results, minus a company-mismatch
//     penalty. A surfaced URL ALONE is NOT enough — for a well-known name the web
//     surfaces a different same-named person's GitHub.
export const GITHUB_MATCH_THRESHOLD = 0.5;

const GENERIC_CO = new Set(["inc", "llc", "ltd", "the", "and", "corp", "group", "labs", "lab", "technologies", "technology", "systems", "com"]);
function companyTokens(company: string | null | undefined): string[] {
  return (company ?? "")
    .toLowerCase()
    .replace(/@/g, " ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !GENERIC_CO.has(t));
}

// Does the GitHub LOGIN encode the subject's specific name? People build handles
// from their names, so a login matching THIS name is strong ownership evidence —
// and, crucially, it does NOT match a different-named person who shares the same
// (mis-attached) handle: `zanesalim` encodes "Zane Salim" but not "Zane Qureshi";
// `helsont` encodes "Helson Taveras" but not "Helison Tavares"; `kaito-project`
// (an org) encodes none of its 5 victims. Returns 0 / 0.5 / 1.
export function usernameEncodesName(
  fullName: string | undefined | null,
  login: string | undefined | null,
): number {
  const handle = (login ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!handle) return 0;
  const tokens = (fullName ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return 0;
  if (tokens.length === 1) {
    const t = tokens[0]!;
    return handle === t || (t.length >= 4 && handle.includes(t)) ? 1 : 0;
  }
  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;
  const strong =
    handle === first + last ||
    handle === last + first ||
    handle === first + last[0] ||
    handle === first[0] + last ||
    (first.length >= 3 && last.length >= 3 && handle.includes(first) && handle.includes(last));
  if (strong) return 1;
  const medium =
    (last.length >= 5 && handle.includes(last)) ||
    (first.length >= 4 && handle.startsWith(first));
  return medium ? 0.5 : 0;
}

export function githubMatchConfidence(
  fullName: string | undefined | null,
  ghUser: { name?: string | null; company?: string | null; login?: string | null },
  fromKnownUrl: boolean,
  subjectCompanyTokens: Set<string>,
): number {
  const a = (fullName ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const b = new Set((ghUser.name ?? "").toLowerCase().split(/\s+/).filter(Boolean));
  const overlap = a.filter((p) => b.has(p)).length;
  const fullNameMatch = a.length >= 2 ? overlap >= 2 : a.length === 1 ? overlap >= 1 : false;

  const ghCo = companyTokens(ghUser.company);
  // Company correlation → near-certain it's the same person.
  if (ghCo.length > 0 && ghCo.some((t) => subjectCompanyTokens.has(t))) return 0.95;

  const loginScore = usernameEncodesName(fullName, ghUser.login);

  let conf = 0;
  if (fullNameMatch) conf += 0.55;
  else if (overlap >= 1) conf += 0.2;
  if (fromKnownUrl) conf += 0.35;
  conf += loginScore * 0.4;

  // A company that did NOT correlate is weak evidence of a DIFFERENT same-named
  // person — but it must not VETO strong ownership evidence (full name match AND a
  // handle that encodes this exact name), which is usually just stale/missing
  // company data on our side rather than a real contradiction.
  if (ghCo.length > 0) {
    const strongOwnership = fullNameMatch && loginScore >= 1;
    conf -= strongOwnership ? 0.15 : 0.4;
  }
  return Math.max(0, Math.min(0.95, conf));
}

// Significant tokens (including company names) from the subject's own LinkedIn
// data, used to corroborate or contradict a GitHub account's stated company.
function subjectCompanyTokensFromContext(ctx: EnricherContext): Set<string> {
  const text = [
    ctx.linkedinPageText ?? "",
    ...(ctx.searchHighlights ?? []).flatMap((h) => [h.title ?? "", ...(h.highlights ?? [])]),
  ]
    .join(" ")
    .toLowerCase();
  return new Set(text.split(/[^a-z0-9]+/).filter((t) => t.length >= 3));
}

// Resolve the GitHub account that confidently belongs to the subject — the SAME
// confidence-gated logic enrichWithGithub uses (name match + company correlation;
// a surfaced URL alone is NOT enough, because a well-known name surfaces a different
// same-named person's GitHub — the rbranson case). Exported so OTHER enrichers (e.g.
// Libraries.io) reuse the confirmed login instead of re-introducing same-name match
// risk. Returns the matched GhUser, or null if no candidate clears the threshold.
export async function resolveConfidentGithubUser(
  ctx: EnricherContext,
  knownGithubUrls: string[],
): Promise<GhUser | null> {
  const handles = guessHandlesFromContext(ctx, knownGithubUrls);
  const subjectCoTokens = subjectCompanyTokensFromContext(ctx);
  for (const handle of handles) {
    const user = (await gh(`/users/${encodeURIComponent(handle)}`)) as GhUser | null;
    if (!user || !user.login) continue;
    const fromKnownUrl = knownGithubUrls.some((u) =>
      u.toLowerCase().includes(`github.com/${user.login.toLowerCase()}`),
    );
    if (githubMatchConfidence(ctx.fullName, user, fromKnownUrl, subjectCoTokens) >= GITHUB_MATCH_THRESHOLD) {
      return user;
    }
  }
  return null;
}

export async function enrichWithGithub(ctx: EnricherContext, knownGithubUrls: string[]): Promise<EnrichmentResult> {
  const facts: string[] = [];
  const citations: string[] = [];
  const user = await resolveConfidentGithubUser(ctx, knownGithubUrls);
  if (!user) {
    return { source: "github", facts: [], citations: [] };
  }
  // Fetch top-by-stars AND recent-by-pushed_at in parallel. The first powers the
  // top-repo/star fact; the second powers the recency signal (most-recent-pushed
  // repo and how many repos got a push in the last 12 months).
  const [topByStars, topByPushed] = await Promise.all([
    gh(`/users/${encodeURIComponent(user.login)}/repos?sort=stars&per_page=10`) as Promise<GhRepo[] | null>,
    gh(`/users/${encodeURIComponent(user.login)}/repos?sort=pushed&per_page=30`) as Promise<GhRepo[] | null>,
  ]);
  const repos = topByStars ?? [];
  // Merge by name so we can count recently-pushed non-fork repos without
  // double-counting between the two lists.
  const repoByName = new Map<string, GhRepo>();
  for (const r of [...(topByStars ?? []), ...(topByPushed ?? [])]) {
    if (!repoByName.has(r.name)) repoByName.set(r.name, r);
  }
  const allRepos = [...repoByName.values()];
  facts.push(`GitHub user @${user.login}${user.name ? ` (${user.name})` : ""}.`);
  if (user.created_at) {
    const years = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (365 * 86400 * 1000));
    facts.push(`Account active ~${years} years (created ${user.created_at.slice(0, 10)}).`);
  }
  if (typeof user.public_repos === "number") facts.push(`${user.public_repos} public repos.`);
  if (typeof user.followers === "number") facts.push(`${user.followers} followers.`);
  if (user.bio) facts.push(`Bio: "${user.bio.replace(/\s+/g, " ").slice(0, 200)}".`);
  const ownRepos = repos.filter((r) => !r.fork).slice(0, 5);
  const totalStars = ownRepos.reduce((s, r) => s + (r.stargazers_count ?? 0), 0);
  if (ownRepos.length > 0) {
    facts.push(`Top ${ownRepos.length} non-fork repos by stars (total ${totalStars}★):`);
    for (const r of ownRepos) {
      const star = r.stargazers_count ?? 0;
      facts.push(`  • ${r.name} (${star}★)${r.language ? ` [${r.language}]` : ""}${r.description ? ` — ${r.description.slice(0, 120)}` : ""}`);
      citations.push(r.html_url);
    }
  }
  // ── RECENCY: distinguish "still ships code today" from "had a GitHub
  // account 14 years ago." Most-recent push across the merged repo set is
  // the strongest signal — looking at every repo's pushed_at avoids being
  // fooled by an old top-by-stars repo while the user is actively
  // committing on smaller side projects.
  const NOW = Date.now();
  const DAY = 86400 * 1000;
  const ownReposAll = allRepos.filter((r) => !r.fork);
  const pushedDates = ownReposAll
    .map((r) => (r.pushed_at ? new Date(r.pushed_at).getTime() : 0))
    .filter((t) => t > 0)
    .sort((a, b) => b - a);
  const mostRecentPushMs = pushedDates[0] ?? 0;
  if (mostRecentPushMs > 0) {
    const daysAgo = Math.floor((NOW - mostRecentPushMs) / DAY);
    const yearsAgo = (daysAgo / 365).toFixed(1);
    const pushedRecentRepoName = ownReposAll.find(
      (r) => r.pushed_at && new Date(r.pushed_at).getTime() === mostRecentPushMs,
    )?.name;
    facts.push(
      `Most recent push: ${daysAgo} days ago (${yearsAgo}y) — repo '${pushedRecentRepoName ?? "?"}'.`,
    );
    const inLast90d = pushedDates.filter((t) => NOW - t < 90 * DAY).length;
    const inLast12mo = pushedDates.filter((t) => NOW - t < 365 * DAY).length;
    facts.push(
      `Repo push counts: ${inLast90d} repo(s) pushed in the last 90 days, ${inLast12mo} in the last 12 months.`,
    );
  } else {
    facts.push(`No public repo push activity detected (dormant or all-private).`);
  }

  // CONTRIBUTION GRAPH (GraphQL) — runs only on the already-confirmed login, so
  // no new identity risk. Surfaces trailing-12-month commit/PR/review totals and,
  // critically, the count of PRIVATE contributions — the fix for a public profile
  // that looks dormant while its owner ships daily in private repos. No-ops
  // without GITHUB_TOKEN.
  const contrib = await fetchGithubContributions(user.login);
  if (contrib) {
    for (const f of githubContributionFacts(contrib)) facts.push(f);
  }

  citations.push(`https://github.com/${user.login}`);

  return {
    source: "github",
    facts,
    citations,
    raw: {
      user,
      top_repos: ownRepos.map((r) => ({ name: r.name, stars: r.stargazers_count })),
      most_recent_push_at: mostRecentPushMs > 0 ? new Date(mostRecentPushMs).toISOString() : null,
      pushed_in_last_90d: pushedDates.filter((t) => NOW - t < 90 * DAY).length,
      pushed_in_last_365d: pushedDates.filter((t) => NOW - t < 365 * DAY).length,
      contributions: contrib,
    },
  };
}

// Derive a candidate GitHub org login from a company domain: the second-level
// label of the registrable domain (apollographql.com → "apollographql",
// meteor.com → "meteor", www.hashicorp.com → "hashicorp"). OSS companies almost
// always name their org after the company, so this covers the common case; when
// it doesn't match a real org the search below simply returns nothing.
export function orgLoginFromDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const clean = domainHost(domain);
  const label = clean.split(".")[0];
  return label && /^[a-z0-9-]{1,39}$/.test(label) ? label : null;
}

// The company's flagship open-source repo (highest-starred, non-fork) for the
// GitHub org derived from `domain`. Uses the GitHub SEARCH API (org repos can't
// be sorted by stars on the REST list endpoint), which returns the top repo in
// one call. Best-effort: returns null on any miss / rate-limit so the caller can
// degrade gracefully. Powers addCompanyGithubBonus — the deterministic
// company-OSS technical bonus for founders (the enricher runs before the company
// domain is resolved, so this is computed post-scoring, like the MM bonus).
export async function companyOrgTopRepo(
  domain: string | null | undefined,
): Promise<{ org: string; repo: string; stars: number } | null> {
  const org = orgLoginFromDomain(domain);
  if (!org) return null;
  const res = (await gh(
    `/search/repositories?q=${encodeURIComponent(`org:${org} fork:false`)}&sort=stars&order=desc&per_page=1`,
  )) as { items?: Array<{ name?: string; stargazers_count?: number }> } | null;
  const top = res?.items?.[0];
  if (!top?.name || typeof top.stargazers_count !== "number") return null;
  return { org, repo: top.name, stars: top.stargazers_count };
}

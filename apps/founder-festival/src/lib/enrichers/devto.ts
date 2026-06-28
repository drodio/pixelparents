import type { EnricherContext, EnrichmentResult } from "./types";

// dev.to (and any Forem-powered community) exposes a public REST API at
// /api/articles, /api/users/by_username, etc. No auth required for read.
//
// Why this matters: "technical prowess" is meaningfully broader than "has a
// GitHub account that's old." Sustained technical writing — explaining how a
// system works, debugging a hard problem in public, contributing to a dev
// community — is direct evidence that a person ships code AND can reason about
// it. dev.to is one of the largest public publishing platforms for that.
//
// Identity is precision-first (like NFX, GitHub): we accept a handle only when
// the dev.to user record's `github_username` or `twitter_username` matches a
// known handle for the subject (LinkedIn-derived or Exa-discovered) OR the
// name strongly matches. Otherwise we drop the candidate — claiming a
// stranger's blog posts would be worse than missing the signal.

const UA = "founder-festival-eval/1.0";
const API = "https://dev.to/api";
const ARTICLES_LIMIT = 30;

type DevtoArticle = {
  title?: string;
  url?: string;
  tag_list?: string[];
  positive_reactions_count?: number;
  comments_count?: number;
  published_at?: string;
  reading_time_minutes?: number;
};
type DevtoUser = {
  username?: string;
  name?: string;
  twitter_username?: string | null;
  github_username?: string | null;
  joined_at?: string;
  location?: string | null;
  website_url?: string | null;
};

// Curated whitelist of dev.to tags that signal a *technical* post. Used to
// distinguish "writes about Rust" from "writes about productivity habits."
// Keep the list conservative — a missing tag means we under-count, not
// over-count, which is the safer failure mode.
const TECHNICAL_TAGS = new Set<string>([
  // languages
  "javascript", "typescript", "python", "rust", "go", "golang", "java", "kotlin",
  "ruby", "php", "csharp", "dotnet", "cpp", "c", "swift", "scala", "elixir",
  "erlang", "clojure", "haskell", "ocaml", "fsharp", "zig", "nim", "crystal",
  "perl", "lua", "dart",
  // web frameworks / libs
  "react", "nextjs", "vue", "vuejs", "svelte", "sveltekit", "angular", "solid",
  "ember", "remix", "astro", "nuxt", "qwik", "preact", "lit",
  // backend
  "node", "nodejs", "express", "fastapi", "django", "flask", "rails", "laravel",
  "spring", "nestjs", "deno", "bun",
  // infra / devops / cloud
  "docker", "kubernetes", "k8s", "terraform", "ansible", "aws", "gcp", "azure",
  "vercel", "netlify", "cloudflare", "supabase", "fly", "linux", "devops",
  "sre", "observability",
  // db / data
  "postgres", "postgresql", "mysql", "sqlite", "mongodb", "redis", "elasticsearch",
  "graphql", "rest", "sql", "database", "kafka", "rabbitmq", "snowflake",
  // ai / ml
  "machinelearning", "ml", "ai", "llm", "deeplearning", "tensorflow", "pytorch",
  "huggingface", "agents", "openai", "anthropic", "rag",
  // crafts / disciplines
  "algorithms", "datastructures", "compilers", "operatingsystems", "networking",
  "security", "cryptography", "blockchain", "web3", "smartcontracts", "testing",
  "performance", "architecture", "designpatterns", "concurrency", "distributed",
  // tooling
  "git", "vim", "neovim", "emacs", "vscode", "webpack", "vite", "esbuild",
  "rollup", "turbopack", "tooling",
  // general
  "programming", "coding", "softwareengineering", "computerscience",
  "tutorial", "webdev",
]);

export function isTechnicalArticle(a: DevtoArticle): boolean {
  if (!a.tag_list || a.tag_list.length === 0) return false;
  return a.tag_list.some((t) => TECHNICAL_TAGS.has(t.toLowerCase()));
}

// Candidate username probes — ordered most-likely-to-be-right first to short-
// circuit on the first identity-confirmed hit. LinkedIn handle goes first
// because Festival's dataset of devs frequently uses the same handle across
// platforms.
export function devtoUsernameCandidates(ctx: EnricherContext, githubHandle: string | null): string[] {
  const out = new Set<string>();
  if (ctx.linkedinHandle) out.add(ctx.linkedinHandle.toLowerCase());
  if (githubHandle) out.add(githubHandle.toLowerCase());
  if (ctx.fullName) {
    const parts = ctx.fullName
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length >= 2) {
      out.add(parts.join("-"));      // jane-doe
      out.add(parts.join(""));       // janedoe
      out.add(parts[0]! + parts[parts.length - 1]!);
    } else if (parts.length === 1) {
      out.add(parts[0]!);
    }
  }
  return Array.from(out).filter((s) => s.length >= 2 && s.length <= 50).slice(0, 4);
}

async function devto<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Identity gate: accept the dev.to user only when ONE of the strongest signals
// agrees with the subject. Precision-first per NFX/GitHub policy.
export function isConfidentDevtoMatch(opts: {
  fullName: string | null;
  linkedinHandle: string | null;
  githubHandle: string | null;
  user: DevtoUser;
}): boolean {
  const { fullName, linkedinHandle, githubHandle, user } = opts;
  const lower = (s: string | null | undefined) => (s ? s.toLowerCase() : null);
  if (githubHandle && lower(user.github_username) === lower(githubHandle)) return true;
  if (linkedinHandle && lower(user.twitter_username) === lower(linkedinHandle)) return true;
  if (linkedinHandle && lower(user.username) === lower(linkedinHandle)) return true;
  if (fullName && user.name) {
    const a = fullName.toLowerCase().split(/\s+/).filter(Boolean);
    const b = new Set(user.name.toLowerCase().split(/\s+/).filter(Boolean));
    const overlap = a.filter((p) => b.has(p)).length;
    const need = a.length >= 2 ? 2 : 1;
    if (overlap >= need) return true;
  }
  return false;
}

export type DevtoRaw = {
  username: string;
  name: string | null;
  joinedAt: string | null;
  totalArticles: number;
  technicalArticles: number;
  totalReactions: number;
  totalComments: number;
  mostRecentPublishedAt: string | null;
  topArticle: {
    title: string;
    url: string;
    reactions: number;
    comments: number;
    tags: string[];
  } | null;
  topTags: string[];
};

// Pull the GitHub handle (if any) that the github enricher confirmed for this
// subject. Lets dev.to's identity check piggy-back on an already-verified
// platform link instead of guessing fresh. Read from the search-highlights
// since enrichers run in parallel and don't see each other's outputs directly.
function knownGithubHandle(ctx: EnricherContext): string | null {
  for (const h of ctx.searchHighlights) {
    const m = h.url.match(/github\.com\/([A-Za-z0-9-]+)/i);
    if (m && m[1] && !/^(orgs|topics|search|trending)$/i.test(m[1])) return m[1];
  }
  return null;
}

export async function enrichWithDevto(ctx: EnricherContext): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "devto", facts: [], citations: [] };
  const githubHandle = knownGithubHandle(ctx);
  const candidates = devtoUsernameCandidates(ctx, githubHandle);
  if (candidates.length === 0) return empty;

  let user: DevtoUser | null = null;
  let username = "";
  for (const h of candidates) {
    const u = await devto<DevtoUser>(`/users/by_username?url=${encodeURIComponent(h)}`);
    if (
      u &&
      u.username &&
      isConfidentDevtoMatch({
        fullName: ctx.fullName,
        linkedinHandle: ctx.linkedinHandle,
        githubHandle,
        user: u,
      })
    ) {
      user = u;
      username = u.username;
      break;
    }
  }
  if (!user) return empty;

  const articles = (await devto<DevtoArticle[]>(`/articles?username=${encodeURIComponent(username)}&per_page=${ARTICLES_LIMIT}`)) ?? [];

  const technical = articles.filter(isTechnicalArticle);
  const totalReactions = articles.reduce((s, a) => s + (a.positive_reactions_count ?? 0), 0);
  const totalComments = articles.reduce((s, a) => s + (a.comments_count ?? 0), 0);

  const tagCounts = new Map<string, number>();
  for (const a of articles) {
    for (const t of a.tag_list ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  const byReactions = [...articles].sort(
    (a, b) => (b.positive_reactions_count ?? 0) - (a.positive_reactions_count ?? 0),
  );
  const top = byReactions[0];
  const mostRecent = articles
    .map((a) => a.published_at)
    .filter((d): d is string => !!d)
    .sort()
    .reverse()[0] ?? null;

  const facts: string[] = [];
  facts.push(
    `Publishes on dev.to as @${username}${user.name && user.name !== username ? ` (${user.name})` : ""}.`,
  );
  if (articles.length > 0) {
    facts.push(
      `${articles.length} article${articles.length === 1 ? "" : "s"} on dev.to (${technical.length} on technical topics, ${totalReactions} total reactions, ${totalComments} comments).`,
    );
  } else {
    facts.push("Account on dev.to but no articles published (account presence only).");
  }
  if (mostRecent) {
    const daysAgo = Math.floor((Date.now() - new Date(mostRecent).getTime()) / 86400000);
    facts.push(`Most recent article: ${daysAgo} days ago — "${(articles.find((a) => a.published_at === mostRecent)?.title ?? "").slice(0, 100)}".`);
  }
  if (top && (top.positive_reactions_count ?? 0) > 0) {
    facts.push(
      `Top article: "${(top.title ?? "").slice(0, 100)}" (${top.positive_reactions_count ?? 0} reactions, ${top.comments_count ?? 0} comments).`,
    );
  }
  if (topTags.length > 0) facts.push(`Frequent tags: ${topTags.join(", ")}.`);

  const raw: DevtoRaw = {
    username,
    name: user.name ?? null,
    joinedAt: user.joined_at ?? null,
    totalArticles: articles.length,
    technicalArticles: technical.length,
    totalReactions,
    totalComments,
    mostRecentPublishedAt: mostRecent,
    topArticle: top
      ? {
          title: top.title ?? "",
          url: top.url ?? "",
          reactions: top.positive_reactions_count ?? 0,
          comments: top.comments_count ?? 0,
          tags: top.tag_list ?? [],
        }
      : null,
    topTags,
  };

  return {
    source: "devto",
    facts,
    citations: [`https://dev.to/${username}`, ...(top?.url ? [top.url] : [])],
    raw,
  };
}

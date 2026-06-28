import type { EnricherContext, EnrichmentResult } from "./types";
import { resolveHnHandle } from "./hackernews";

// HN Tokenmaxxing Leaderboard enricher.
//
// Data source: https://tkmx.odio.dev/api/users (list of 50 listed members,
// each with `username` and `hn_username`) + /api/usage?days=28 (usage rows
// per user/date/model). No auth required, public JSON endpoints.
//
// Matching strategy: use the subject's HN handle (extracted upstream into
// knownHnUrls / context). Match against either the user.hn_username or
// user.username field on the leaderboard. Match is case-insensitive and
// requires exact equality — partial matches would create false positives.
//
// Signal value: being listed at all is moderate (these are curated/opt-in
// active LLM users). Higher ranks indicate sustained heavy usage. Maps onto
// the "Technical Depth" credibility vector since it measures actual day-to-
// day AI tool usage by the subject. Tier-based to keep it stable as the
// leaderboard reshuffles.

const UA = "founder-festival-eval/1.0 (https://festival.so)";
const BASE = "https://tkmx.odio.dev";

type TkmxUser = {
  username: string;
  hn_username?: string | null;
  tools?: string | null;
  communities?: string | null;
  projects?: string | null;
};
type UsersResp = { users: TkmxUser[] };

type UsageRow = {
  username: string;
  date: string;
  model: string;
  total_tokens: number;
  cost: number | null;
  source?: string | null;
};
type UsageResp = { days: number; rows: UsageRow[] };

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function findCandidate(users: TkmxUser[], handle: string): TkmxUser | null {
  const h = handle.toLowerCase();
  for (const u of users) {
    if (u.username?.toLowerCase() === h) return u;
    if (u.hn_username?.toLowerCase() === h) return u;
  }
  return null;
}

// Aggregate total_tokens per username over the period, then sort to get rank.
function buildRank(usage: UsageRow[]): Map<string, { rank: number; totalTokens: number }> {
  const agg = new Map<string, number>();
  for (const r of usage) {
    if (!r.username) continue;
    const lc = r.username.toLowerCase();
    agg.set(lc, (agg.get(lc) ?? 0) + (Number(r.total_tokens) || 0));
  }
  const sorted = [...agg.entries()].sort((a, b) => b[1] - a[1]);
  const out = new Map<string, { rank: number; totalTokens: number }>();
  sorted.forEach(([u, t], i) => out.set(u, { rank: i + 1, totalTokens: t }));
  return out;
}

function formatTokens(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

export async function enrichWithHnTokenmaxxing(
  ctx: EnricherContext,
  knownHnUrls: string[],
): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "hn-tokenmaxxing", facts: [], citations: [] };

  // Resolve the subject's HN handle via the SHARED resolver (Exa URL → derived
  // candidate w/ bio → content discovery). This previously only read Exa-surfaced
  // HN URLs, so it silently missed anyone whose HN profile URL wasn't surfaced —
  // e.g. Sam Odio (#1 on this very board) and DROdio, both of whom are listed on
  // tkmx. Now whoever the HN enricher can identify, this can too.
  const resolved = await resolveHnHandle(ctx, knownHnUrls);
  if (!resolved) return empty;
  const handle = resolved.handle;

  // Fetch users + usage in parallel.
  const [usersRes, usageRes] = await Promise.all([
    fetchJson<UsersResp>(`${BASE}/api/users`),
    fetchJson<UsageResp>(`${BASE}/api/usage?days=28`),
  ]);

  if (!usersRes?.users || !usageRes?.rows) return empty;

  const candidate = findCandidate(usersRes.users, handle);
  if (!candidate) return empty;

  // Look up the candidate's rank by their tkmx `username` (the field used in
  // usage rows). Falls back to looking up by hn_username if usage rows happen
  // to be keyed differently (defensive).
  const rankBy = buildRank(usageRes.rows);
  const entry =
    rankBy.get(candidate.username.toLowerCase()) ??
    (candidate.hn_username ? rankBy.get(candidate.hn_username.toLowerCase()) : undefined);

  const facts: string[] = [];
  facts.push(
    `Listed on HN Tokenmaxxing leaderboard as @${candidate.username}` +
      (candidate.hn_username ? ` (HN handle @${candidate.hn_username})` : "") +
      ".",
  );
  if (candidate.tools) facts.push(`Reported tools: ${candidate.tools}.`);
  if (candidate.projects) {
    const projectList = candidate.projects
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (projectList.length > 0) {
      facts.push(`Projects: ${projectList.slice(0, 4).join(", ")}${projectList.length > 4 ? "…" : ""}.`);
    }
  }
  if (entry) {
    facts.push(
      `Ranked #${entry.rank} on the 28-day total-tokens leaderboard with ${formatTokens(entry.totalTokens)} tokens.`,
    );
  }

  return {
    source: "hn-tokenmaxxing",
    facts,
    citations: [
      `${BASE}/${candidate.username}`,
      `${BASE}/`,
    ],
    raw: {
      username: candidate.username,
      hn_username: candidate.hn_username ?? null,
      tools: candidate.tools ?? null,
      communities: candidate.communities ?? null,
      projects: candidate.projects ?? null,
      rank: entry?.rank ?? null,
      total_tokens_28d: entry?.totalTokens ?? null,
    },
  };
}

import type { EnricherContext, EnrichmentResult } from "./types";
import { nameOverlaps } from "./identity";

// Stack Exchange API v2.3 — free, no key required. A key only raises the
// hourly quota (300 → 10 000); we degrade gracefully when unset.
//
// Resolve strategy (highest trust first):
//   1. Known SO profile URL → extract user_id directly.
//   2. Name search → accept only the highest-rep candidate whose display_name
//      passes nameOverlaps(ctx.fullName, display_name).
//
// Matching philosophy (same as HN): precision over recall. A false attribution
// on a credibility product is worse than a missing one.

const UA = "founder-festival-eval/1.0 (https://festival.so)";
const API_BASE = "https://api.stackexchange.com/2.3";

// Optional key to raise quota (300 req/hr → 10 000 req/hr).
function apiKey(): string {
  const k = process.env.STACK_EXCHANGE_KEY;
  return k ? `&key=${encodeURIComponent(k)}` : "";
}

type SoBadgeCounts = { gold: number; silver: number; bronze: number };
type SoUser = {
  user_id: number;
  display_name: string;
  reputation: number;
  link: string;
  badge_counts: SoBadgeCounts;
};
type SoUsersResponse = { items?: SoUser[] };

type SoTopTag = { tag_name: string; answer_score: number };
type SoTopTagsResponse = { items?: SoTopTag[] };

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Extract a numeric user_id from a known stackoverflow.com URL.
// Handles: https://stackoverflow.com/users/22656/jon-skeet
//          https://stackoverflow.com/users/22656
function userIdFromUrls(urls: string[]): number | null {
  for (const u of urls) {
    const m = u.match(/stackoverflow\.com\/users\/(\d+)/i);
    if (m && m[1]) return parseInt(m[1], 10);
  }
  return null;
}

async function fetchUserById(userId: number): Promise<SoUser | null> {
  const url = `${API_BASE}/users/${userId}?site=stackoverflow${apiKey()}`;
  const data = await fetchJson<SoUsersResponse>(url);
  return data?.items?.[0] ?? null;
}

async function fetchTopTags(userId: number): Promise<SoTopTag[]> {
  const url = `${API_BASE}/users/${userId}/top-tags?site=stackoverflow&pagesize=5${apiKey()}`;
  const data = await fetchJson<SoTopTagsResponse>(url);
  return data?.items ?? [];
}

export async function enrichWithStackOverflow(
  ctx: EnricherContext,
  knownStackoverflowUrls: string[],
): Promise<EnrichmentResult> {
  const empty: EnrichmentResult = { source: "stackoverflow", facts: [], citations: [] };

  let user: SoUser | null = null;
  let confirmedVia: "known-url" | "name-search" = "name-search";

  // 1. Highest trust: extract user_id from a URL we already know belongs to
  //    this person (e.g., surfaced by Exa).
  const knownUserId = userIdFromUrls(knownStackoverflowUrls);
  if (knownUserId != null) {
    user = await fetchUserById(knownUserId);
    if (user) confirmedVia = "known-url";
  }

  // 2. Fallback: name search. Only accept a candidate whose display_name
  //    passes nameOverlaps — filters out same-first-name strangers.
  if (!user && ctx.fullName) {
    const searchUrl =
      `${API_BASE}/users?inname=${encodeURIComponent(ctx.fullName)}` +
      `&site=stackoverflow&order=desc&sort=reputation&pagesize=5${apiKey()}`;
    const data = await fetchJson<SoUsersResponse>(searchUrl);
    const candidates = data?.items ?? [];
    for (const cand of candidates) {
      if (nameOverlaps(ctx.fullName, cand.display_name)) {
        user = cand;
        confirmedVia = "name-search";
        break; // items are already sorted by reputation desc; first match is best
      }
    }
  }

  if (!user) return empty;

  // Fetch top tags (nice-to-have; non-fatal if it fails).
  const topTags = await fetchTopTags(user.user_id);

  const facts: string[] = [];
  const { reputation, display_name, badge_counts, link } = user;
  const { gold, silver, bronze } = badge_counts;

  facts.push(
    `Stack Overflow: ${display_name} — ${reputation.toLocaleString("en-US")} reputation` +
      ` (gold ${gold}, silver ${silver}, bronze ${bronze}).`,
  );

  if (topTags.length > 0) {
    const tagList = topTags.map((t) => t.tag_name).join(", ");
    facts.push(`Top tags: ${tagList}.`);
  }

  return {
    source: "stackoverflow",
    facts,
    citations: [link],
    raw: {
      user_id: user.user_id,
      display_name,
      reputation,
      badges: badge_counts,
      top_tags: topTags.map((t) => ({ tag: t.tag_name, answer_score: t.answer_score })),
      confirmed_via: confirmedVia,
    },
  };
}

// PURE, DB-free filter + sort helpers for the Exchange board. Shared by the
// board client and unit tests so the rules can't silently diverge. The board
// fetches a flat list of posts from the server (created_at ASC) and applies these
// transforms in-memory. Keeping them pure makes the default-sort + facet behavior
// directly testable without React or a DB.

import type { AskKind, AskUrgency } from "@/lib/db/asks";

// A board-shaped post (the subset the board needs — the page projects rows into
// this shape, serializing dates to ISO strings for the client boundary).
export type ExchangePost = {
  id: string;
  kind: AskKind;
  title: string;
  body: string;
  tags: string[];
  urgency: AskUrgency;
  status: string; // open | matched | resolved | closed
  createdAt: string; // ISO
  validUntil: string | null; // ISO | null
  authorName: string;
  isStudent: boolean;
};

export type KindFilter = "all" | AskKind;
export type StatusFilter = "open" | "resolved" | "all";
export type SortKey = "recency" | "urgency";
export type SortDir = "asc" | "desc";

export type ExchangeFilters = {
  kind: KindFilter;
  status: StatusFilter;
  // Selected expertise-tag facet keys (lowercased). Empty → no tag filter.
  tags: Set<string>;
  sortKey: SortKey;
  sortDir: SortDir;
  // When false, hide posts whose validUntil is in the past.
  showExpired: boolean;
  // Restrict to posts authored by this signup id (the "my posts" facet). null → all.
  mineSignupId?: string | null;
  // For "my posts" we'd need an author id on the post; the board passes a set of
  // ids it owns instead (the page knows the viewer's id).
  myPostIds?: Set<string> | null;
};

const URGENCY_RANK: Record<AskUrgency, number> = { low: 0, normal: 1, high: 2 };

// Is the post expired as of `now`? A null validUntil never expires.
export function isExpired(post: Pick<ExchangePost, "validUntil">, now: number = Date.now()): boolean {
  if (!post.validUntil) return false;
  const ms = Date.parse(post.validUntil);
  return Number.isFinite(ms) && ms <= now;
}

// Is the post expiring "soon" (within `withinMs`, default 3 days) but not yet
// expired? Drives the "expires soon" badge.
export function isExpiringSoon(
  post: Pick<ExchangePost, "validUntil">,
  now: number = Date.now(),
  withinMs: number = 3 * 24 * 60 * 60 * 1000,
): boolean {
  if (!post.validUntil) return false;
  const ms = Date.parse(post.validUntil);
  if (!Number.isFinite(ms)) return false;
  return ms > now && ms - now <= withinMs;
}

// Apply the full filter + sort pipeline. Pure + deterministic (now injectable).
export function filterAndSortPosts(
  posts: ExchangePost[],
  filters: ExchangeFilters,
  now: number = Date.now(),
): ExchangePost[] {
  let out = posts.slice();

  // Kind facet.
  if (filters.kind !== "all") {
    out = out.filter((p) => p.kind === filters.kind);
  }

  // Status facet. 'open' shows only open; 'resolved' only resolved; 'all' shows
  // everything the server returned (open + resolved + matched).
  if (filters.status === "open") {
    out = out.filter((p) => p.status === "open");
  } else if (filters.status === "resolved") {
    out = out.filter((p) => p.status === "resolved");
  }

  // Tag facet (OR match — a post matches if it carries ANY selected tag).
  if (filters.tags.size > 0) {
    out = out.filter((p) => {
      const keys = p.tags.map((t) => t.toLowerCase());
      return keys.some((k) => filters.tags.has(k));
    });
  }

  // "My posts" facet.
  if (filters.myPostIds && filters.myPostIds.size > 0 && filters.mineSignupId) {
    out = out.filter((p) => filters.myPostIds!.has(p.id));
  }

  // Expiry: optionally hide expired posts.
  if (!filters.showExpired) {
    out = out.filter((p) => !isExpired(p, now));
  }

  // Sort. Secondary key is always created_at ASC for stability so the
  // "oldest first" default is deterministic within an urgency tier.
  out.sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    if (filters.sortKey === "urgency") {
      const ua = URGENCY_RANK[a.urgency] ?? 1;
      const ub = URGENCY_RANK[b.urgency] ?? 1;
      if (ua !== ub) return filters.sortDir === "desc" ? ub - ua : ua - ub;
      return ta - tb; // tie → oldest first
    }
    // recency
    if (ta !== tb) return filters.sortDir === "desc" ? tb - ta : ta - tb;
    return a.id.localeCompare(b.id);
  });

  return out;
}

// Distinct tags across posts, deduped case-insensitively (first-seen label kept),
// sorted for a stable facet row.
export function distinctTags(posts: ExchangePost[]): string[] {
  const byKey = new Map<string, string>();
  for (const p of posts) {
    for (const t of p.tags) {
      const k = t.toLowerCase();
      if (!byKey.has(k)) byKey.set(k, t);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

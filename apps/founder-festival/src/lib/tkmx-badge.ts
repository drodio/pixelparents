// Reads the HN Tokenmaxxing leaderboard standing that the `hn-tokenmaxxing`
// enricher persisted onto evaluations.profile.enrichments[].raw at scoring time
// (see src/lib/enrichers/hn-tokenmaxxing.ts). Using the stored value — rather
// than a live fetch on every profile render — keeps profile pages fast and
// independent of tkmx.odio.dev uptime; the rank refreshes on the next re-score,
// like every other scored fact on the page.

const TKMX_BASE = "https://tkmx.odio.dev";

export type TkmxBadge = {
  rank: number;
  username: string;
  // Public tkmx profile, e.g. https://tkmx.odio.dev/u/DROdio
  profileUrl: string;
};

export function getTkmxBadge(profile: unknown): TkmxBadge | null {
  const enrichments =
    profile && typeof profile === "object"
      ? (profile as { enrichments?: unknown }).enrichments
      : null;
  if (!Array.isArray(enrichments)) return null;

  for (const e of enrichments) {
    if (!e || typeof e !== "object") continue;
    if ((e as { source?: unknown }).source !== "hn-tokenmaxxing") continue;
    const raw = (e as { raw?: unknown }).raw;
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    const rank = typeof r.rank === "number" && Number.isFinite(r.rank) ? r.rank : null;
    const username =
      typeof r.username === "string" && r.username.trim() ? r.username.trim() : null;
    // Only a badge-worthy entry (ranked AND linkable) qualifies. A listed-but-
    // unranked member (no usage rows) gets no badge.
    if (rank === null || !username) return null;
    return {
      rank,
      username,
      profileUrl: `${TKMX_BASE}/u/${encodeURIComponent(username)}`,
    };
  }
  return null;
}

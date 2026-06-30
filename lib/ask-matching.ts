// PURE, DB-free expertise matcher for the OHS asks connector. Ranks candidate
// helper profiles by overlap between an ask's expertiseTags and a member's
// expertise signals. Deterministic + keyless (no AI/network/DB) so it's a stable
// unit-testable seam — a future AI matcher can wrap or replace `rankCandidates`
// without touching the route/data layer. The DB↔matcher adapter (which projects
// SignupRows into HelperCandidates and pre-filters) lives in lib/db/asks.ts.
//
// Ported in SHAPE from the founder-festival reference (PR #106): overlap-count
// scoring, ask-ordered overlap tags, student exclusion, asker exclusion, and a
// fully stable tiebreak (richer profile first, then name, then id).

// One member's worth of matchable data. `expertiseSignals` is the UNION of the
// member's curated enrichment expertiseTags, self-reported skillsets, and parent
// interests (assembled by the data layer). `signalCount` is a richness proxy used
// ONLY as a deterministic tiebreak (more enriched/expert signals rank first).
export type HelperCandidate = {
  signupId: string;
  token: string | null; // /community/<token> link, when the member shares
  name: string | null;
  // Carried for display only. In the Exchange model anyone (parent OR student)
  // can help, so this no longer excludes the candidate — kept for the card badge.
  isStudent: boolean;
  expertiseSignals: string[];
  signalCount: number;
};

export type AskMatch = {
  signupId: string;
  token: string | null;
  name: string | null;
  // Primary ranking key = overlap count (no opaque "score" — just how many tags
  // matched). Kept named `score` for parity with the reference shape.
  score: number;
  // The exact shared tags, in the ASK's order, so the UI can render stable
  // "matched on: X, Y" chips.
  overlapTags: string[];
};

export type RankOptions = {
  askTags: string[];
  candidates: HelperCandidate[];
  // The asker's signupId — never suggest the asker to themselves. null/undefined
  // excludes no one.
  excludeSignupId?: string | null;
  // Cap on returned matches (default 10).
  limit?: number;
};

// Normalize a tag list into a lowercased, trimmed, de-duplicated Set. Drops
// non-strings + blanks so callers can pass raw DB arrays safely.
function normalizeTagSet(tags: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const v = t.trim().toLowerCase();
    if (v) out.add(v);
  }
  return out;
}

// Rank helper candidates for an ask by expertise-tag overlap. Pure + deterministic.
//
// Rules (overlap is the ONLY v1 signal):
//   - No ask tags → no signal → [] (nothing to match on).
//   - Exclude the author (excludeSignupId). Students are NOT excluded — in the
//     Exchange model anyone can help (the #109 student restriction is removed).
//   - overlapTags = ask tags (in ask order) present in the candidate's signals.
//   - Drop zero-overlap candidates.
//   - score = overlapTags.length.
// Stable sort: score desc → signalCount desc (richer enrichment first) → name asc
// → signupId asc. Then slice to `limit`.
export function rankCandidates(opts: RankOptions): AskMatch[] {
  const { askTags, candidates, excludeSignupId = null, limit = 10 } = opts;

  // Preserve the ask's tag order for display while de-duping for matching.
  const seen = new Set<string>();
  const orderedAskTags: string[] = [];
  for (const t of askTags) {
    if (typeof t !== "string") continue;
    const v = t.trim().toLowerCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      orderedAskTags.push(v);
    }
  }
  if (orderedAskTags.length === 0) return [];

  const signalCountById = new Map<string, number>();
  const matches: AskMatch[] = [];

  for (const c of candidates) {
    if (excludeSignupId && c.signupId === excludeSignupId) continue;
    // Students are NO LONGER excluded — anyone can help in the Exchange model.

    const candSet = normalizeTagSet(c.expertiseSignals);
    // Iterate the ASK's tags so overlap stays in ask order. Map back to a display
    // label = the ask's tag (already lowercased; UIs can title-case if desired).
    const overlapTags = orderedAskTags.filter((t) => candSet.has(t));
    if (overlapTags.length === 0) continue;

    signalCountById.set(c.signupId, c.signalCount);
    matches.push({
      signupId: c.signupId,
      token: c.token,
      name: c.name,
      score: overlapTags.length,
      overlapTags,
    });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score; // 1. overlap count desc
    const fa = signalCountById.get(a.signupId) ?? 0;
    const fb = signalCountById.get(b.signupId) ?? 0;
    if (fb !== fa) return fb - fa; // 2. richer profile first
    const na = a.name ?? "";
    const nb = b.name ?? "";
    if (na !== nb) return na.localeCompare(nb); // 3. name asc
    return a.signupId.localeCompare(b.signupId); // 4. stable id tiebreak
  });

  return matches.slice(0, Math.max(0, limit));
}

// PURE, DB-free matcher for "Families who share your interests" — the auto-matching
// / suggested-connections surface. Given the viewer's interests and a set of other
// families' interests, it ranks those families by how many interests they SHARE
// with the viewer. Deterministic + keyless (no AI/network/DB) so it's a stable,
// unit-testable seam, mirroring lib/ask-matching.ts's rankCandidates shape.
//
// CANONICALIZATION CONTRACT (the "clubbing Yegge and Linus" guardrail): two
// interests are the SAME here ONLY when they are equal after trim + lowercase — the
// exact same rule lib/interests.ts uses. Overlap is computed on that normalized key,
// so a match on "Mountain Biking" vs "mountain biking" counts, but "Yegge" and
// "Linus" (different keys) NEVER count as a shared interest. This module can only
// group families that genuinely share a spelling; it can't merge two distinct
// interests. (See lib/interest-matching.test.ts for the regression pins.)

// One other family's worth of matchable data. `interests` is the family's shared
// interest set (already coarsened/opt-in-gated by the data layer); `signalCount`
// is a richness proxy used ONLY as a deterministic tiebreak.
export type FamilyInterestCandidate = {
  signupId: string;
  token: string | null; // /directory/<token> link, when the family shares a profile
  name: string | null;
  isStudent: boolean;
  interests: string[];
  signalCount: number;
};

export type InterestMatch = {
  signupId: string;
  token: string | null;
  name: string | null;
  isStudent: boolean;
  // Primary ranking key = shared-interest count (no opaque score — just how many
  // interests overlap the viewer's).
  score: number;
  // The exact shared interests, in the VIEWER's order, so the UI can render stable
  // "shared: X, Y" chips using the viewer's own spelling.
  sharedInterests: string[];
};

export type RankInterestOptions = {
  // The viewer's own interests (display order preserved for the shared chips).
  viewerInterests: string[];
  candidates: FamilyInterestCandidate[];
  // The viewer's signupId — never suggest the viewer to themselves. Also excludes
  // any co-parent rows the caller passes (e.g. same family_id). null excludes no one.
  excludeSignupIds?: readonly string[] | null;
  // Cap on returned matches (default 12).
  limit?: number;
};

// Normalize an interest for overlap: trim + lowercase, matching lib/interests.ts's
// `key`. Non-strings/blanks are dropped so raw DB arrays are safe to pass.
function normalizeKey(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const v = s.trim().toLowerCase();
  return v || null;
}

// Rank other families for a viewer by shared-interest overlap. Pure + deterministic.
//
// Rules (overlap is the ONLY signal):
//   - No viewer interests → no signal → [] (nothing to match on).
//   - Exclude the viewer + any passed co-parent signupIds.
//   - sharedInterests = viewer interests (in viewer order) present in the
//     candidate's interests, compared case-insensitively. Display uses the VIEWER's
//     spelling so chips are stable regardless of the other family's casing.
//   - Drop zero-overlap candidates.
//   - score = sharedInterests.length.
// Stable sort: score desc → signalCount desc (richer profile first) → name asc →
// signupId asc. Then slice to `limit`.
export function rankInterestMatches(opts: RankInterestOptions): InterestMatch[] {
  const { viewerInterests, candidates, excludeSignupIds = null, limit = 12 } = opts;

  // Preserve the viewer's interest order for display while de-duping by key.
  const seen = new Set<string>();
  const orderedViewer: Array<{ key: string; label: string }> = [];
  for (const raw of viewerInterests) {
    const k = normalizeKey(raw);
    if (k && !seen.has(k)) {
      seen.add(k);
      // Safe: normalizeKey returned non-null, so raw is a non-blank string.
      orderedViewer.push({ key: k, label: (raw as string).trim() });
    }
  }
  if (orderedViewer.length === 0) return [];

  const exclude = new Set(excludeSignupIds ?? []);
  const signalCountById = new Map<string, number>();
  const matches: InterestMatch[] = [];

  for (const c of candidates) {
    if (exclude.has(c.signupId)) continue;

    const candKeys = new Set<string>();
    for (const i of c.interests) {
      const k = normalizeKey(i);
      if (k) candKeys.add(k);
    }
    // Iterate the VIEWER's interests so shared stays in viewer order + spelling.
    const sharedInterests = orderedViewer
      .filter((v) => candKeys.has(v.key))
      .map((v) => v.label);
    if (sharedInterests.length === 0) continue;

    signalCountById.set(c.signupId, c.signalCount);
    matches.push({
      signupId: c.signupId,
      token: c.token,
      name: c.name,
      isStudent: c.isStudent,
      score: sharedInterests.length,
      sharedInterests,
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

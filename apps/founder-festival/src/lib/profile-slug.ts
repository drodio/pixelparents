// Vanity profile URLs.
//
// Each evaluation gets a stable slug on first write:
//   /profile/<slug_kind>/<slug>     e.g. /profile/founder/daniel-ruben-odio
//
// And when the claimer has a Clerk username, that takes precedence:
//   /profile/<clerk_username>       e.g. /profile/drodio
//
// Slug uniqueness is GLOBAL across both roles. Both /founder/<slug> and
// /investor/<slug> resolve for every profile: the non-canonical role
// 301-redirects to the canonical (evaluations.slug_kind). Two people who
// would slugify to the same name in different roles get a numeric suffix
// on the second one regardless of role (john-smith-2, john-smith-3, ...).
//
// slug_kind is picked once at first eval write from whichever score is
// higher; for unclaimed profiles it stays that way through re-scores.
// Claimed users can change both slug AND slug_kind via /account; old
// slugs are parked in profile_slug_aliases for the redirect, and the
// uniqueness check below treats those aliases as taken.

import { db } from "@/db";
import { evaluations, profileSlugAliases } from "@/db/schema";
import { eq, like } from "drizzle-orm";

export type SlugKind = "founder" | "investor";

/** Lowercase + ASCII-fold a full name into the base of a slug. */
export function nameToSlugBase(fullName: string | null | undefined): string {
  if (!fullName) return "";
  return (
    fullName
      // Decompose accented characters (é → e + ´) then drop the combining marks.
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      // Lowercase, then keep only [a-z0-9] and word separators.
      .toLowerCase()
      // Strip apostrophes (O'Brien → obrien, not o-brien).
      .replace(/['‘’]/g, "")
      // Replace anything else with a hyphen.
      .replace(/[^a-z0-9]+/g, "-")
      // Collapse multiple hyphens and trim edges.
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

export function pickSlugKind(founderScore: number, investorScore: number): SlugKind {
  // Tie → founder (the dimension most users self-identify with).
  return investorScore > founderScore ? "investor" : "founder";
}

/**
 * Generate a unique slug for `baseSlug` by appending -2/-3/... if needed.
 * Uniqueness is global across BOTH evaluations.slug and the historical
 * profile_slug_aliases.alias_slug — a slug parked from someone else's
 * earlier edit is considered taken. Pass the eval id of the row we're
 * assigning the slug to so we don't treat its OWN current slug (or its
 * OWN historical aliases) as a conflict.
 *
 * NOTE: kind is kept in the signature so callers don't need to be
 * updated, but it no longer scopes the uniqueness check.
 */
export async function ensureUniqueSlug(
  _kind: SlugKind,
  baseSlug: string,
  selfEvalId: string | null,
): Promise<string> {
  if (!baseSlug) baseSlug = "unknown";
  // Pull every row whose slug starts with baseSlug from BOTH evaluations
  // (active slugs) and profile_slug_aliases (historical slugs). Cheaper
  // than N round-trips for the pathological case of many collisions.
  const [existingEvals, existingAliases] = await Promise.all([
    db
      .select({ id: evaluations.id, slug: evaluations.slug })
      .from(evaluations)
      .where(like(evaluations.slug, `${baseSlug}%`)),
    db
      .select({ evalId: profileSlugAliases.evaluationId, slug: profileSlugAliases.aliasSlug })
      .from(profileSlugAliases)
      .where(like(profileSlugAliases.aliasSlug, `${baseSlug}%`)),
  ]);
  const taken = new Set<string>();
  for (const r of existingEvals) {
    if (r.id !== selfEvalId && r.slug != null) taken.add(r.slug);
  }
  for (const a of existingAliases) {
    if (a.evalId !== selfEvalId) taken.add(a.slug);
  }
  if (!taken.has(baseSlug)) return baseSlug;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${baseSlug}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 1000 collisions is absurd but make it deterministic anyway with the id.
  return `${baseSlug}-${(selfEvalId ?? "x").slice(0, 8)}`;
}

/**
 * Assign (slug, slugKind) to an evaluation row that doesn't have one yet.
 * Idempotent: if the row already has a slug, returns existing values
 * unchanged. Re-scores never call this on already-slugged rows so the URL
 * stays stable as scores shift.
 */
export async function assignSlugIfMissing(opts: {
  evalId: string;
  fullName: string | null;
  linkedinUrl: string;
  founderScore: number;
  investorScore: number;
}): Promise<{ slug: string; slugKind: SlugKind }> {
  const { evalId, fullName, linkedinUrl, founderScore, investorScore } = opts;
  const [existing] = await db
    .select({ slug: evaluations.slug, slugKind: evaluations.slugKind })
    .from(evaluations)
    .where(eq(evaluations.id, evalId))
    .limit(1);
  if (existing?.slug && existing.slugKind) {
    return { slug: existing.slug, slugKind: existing.slugKind as SlugKind };
  }

  const kind = pickSlugKind(founderScore, investorScore);
  // Prefer fullName; fall back to the LinkedIn handle if name is missing.
  const fromName = nameToSlugBase(fullName);
  const fromHandle = nameToSlugBase(
    linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1]?.replace(/-/g, " ") ?? "",
  );
  const base = fromName || fromHandle || "unknown";
  const slug = await ensureUniqueSlug(kind, base, evalId);
  await db
    .update(evaluations)
    .set({ slug, slugKind: kind })
    .where(eq(evaluations.id, evalId));
  return { slug, slugKind: kind };
}

/**
 * Build the canonical profile URL for an evaluation given what we know.
 * Order of precedence:
 *   1. /profile/<clerkUsername>          (caller passes username if known)
 *   2. /profile/<slugKind>/<slug>        (from the evaluations row)
 *   3. /profile?e=<evalId>               (legacy fallback for un-slugged rows)
 */
export function profileUrlFor(opts: {
  evalId: string;
  slug?: string | null;
  slugKind?: string | null;
  clerkUsername?: string | null;
}): string {
  if (opts.clerkUsername && opts.clerkUsername.trim()) {
    return `/profile/${encodeURIComponent(opts.clerkUsername.trim())}`;
  }
  if (opts.slug && opts.slugKind) {
    return `/profile/${opts.slugKind}/${opts.slug}`;
  }
  return `/profile?e=${opts.evalId}`;
}

// DB-touching helpers for the claimed-user editor of (nickname, slugKind, slug).
// Pure validators live in src/lib/profile-slug-validate.ts so they can be
// unit-tested without a database connection.

import { db } from "@/db";
import { evaluations, profileSlugAliases } from "@/db/schema";
import { eq } from "drizzle-orm";

export type { SlugKind, SlugValidationError, NicknameValidationError } from "@/lib/profile-slug-validate";
export {
  validateSlug,
  validateNickname,
  validateSlugKind,
} from "@/lib/profile-slug-validate";

/**
 * True if `slug` is currently taken by a row OTHER than `selfEvalId`. A slug
 * counts as taken if it's in evaluations.slug OR profile_slug_aliases.alias_slug.
 * Pass selfEvalId so the caller's own current slug isn't treated as a conflict.
 */
export async function isSlugTaken(slug: string, selfEvalId: string): Promise<boolean> {
  const [evalHit] = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(eq(evaluations.slug, slug))
    .limit(1);
  if (evalHit && evalHit.id !== selfEvalId) return true;

  const [aliasHit] = await db
    .select({ evaluationId: profileSlugAliases.evaluationId })
    .from(profileSlugAliases)
    .where(eq(profileSlugAliases.aliasSlug, slug))
    .limit(1);
  if (aliasHit && aliasHit.evaluationId !== selfEvalId) return true;

  return false;
}

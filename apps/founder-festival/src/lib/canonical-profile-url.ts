// Helper used by /welcome and /profile (with ?e=<uuid>) to redirect a
// legacy URL to its canonical vanity URL (/profile/<username> or
// /profile/<kind>/<slug>). Returns null when no canonical exists yet
// (legacy un-slugged row or unknown id) — callers should fall through.

import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { profileUrlFor } from "./profile-slug";
import { isUuid } from "./canonicalize";

export async function canonicalProfileUrl(evalId: string): Promise<string | null> {
  if (!isUuid(evalId)) return null;
  const [row] = await db
    .select({ slug: evaluations.slug, slugKind: evaluations.slugKind })
    .from(evaluations)
    .where(eq(evaluations.id, evalId))
    .limit(1);
  if (!row) return null;
  // Prefer a Clerk username on the claim row if one exists.
  const [claim] = await db
    .select({ clerkUsername: users.clerkUsername })
    .from(users)
    .where(
      and(
        eq(users.evaluationId, evalId),
        // Owner-grade only: a medium (name-only) claimer's Clerk username must
        // not become the canonical public URL for someone else's profile.
        eq(users.matchConfidence, "high"),
      ),
    )
    .orderBy(desc(users.verifiedAt))
    .limit(1);
  const href = profileUrlFor({
    evalId,
    clerkUsername: claim?.clerkUsername ?? null,
    slug: row.slug,
    slugKind: row.slugKind,
  });
  // Don't redirect to the legacy form (would loop).
  if (href.startsWith("/profile?")) return null;
  return href;
}

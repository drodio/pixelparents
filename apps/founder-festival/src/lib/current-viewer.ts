import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { profileUrlFor } from "./profile-slug";

// Shared helper for page-level headers: resolves the current viewer's
// authentication state and their own profile URL (when they've claimed a
// profile). Used by /profile, /leaderboard, /events to feed the
// SiteHeaderNav so we don't duplicate the users-join logic across pages.
//
// Returns:
//   - isAuthed: whether the user has a Clerk session.
//   - profileHref: their canonical profile URL, or null if unclaimed.
//   - clerkUserId: the Clerk session userId (for callers that also need it).
export async function getCurrentViewerContext(): Promise<{
  isAuthed: boolean;
  profileHref: string | null;
  clerkUserId: string | null;
  // The eval the viewer has actually CLAIMED (users.evaluationId), or null. This
  // is what "YOU" on the leaderboard must key off — NOT the ?e= highlight param,
  // which is just "the profile you navigated from" and would mislabel any
  // profile (e.g. an admin viewing someone else's) as the viewer.
  ownEvaluationId: string | null;
}> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return { isAuthed: false, profileHref: null, clerkUserId: null, ownEvaluationId: null };
  }
  const [row] = await db
    .select({
      evaluationId: users.evaluationId,
      clerkUsername: users.clerkUsername,
      slug: evaluations.slug,
      slugKind: evaluations.slugKind,
    })
    .from(users)
    .leftJoin(evaluations, eq(evaluations.id, users.evaluationId))
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  const profileHref = row?.evaluationId
    ? profileUrlFor({
        evalId: row.evaluationId,
        clerkUsername: row.clerkUsername,
        slug: row.slug,
        slugKind: row.slugKind,
      })
    : null;
  return { isAuthed: true, profileHref, clerkUserId, ownEvaluationId: row?.evaluationId ?? null };
}

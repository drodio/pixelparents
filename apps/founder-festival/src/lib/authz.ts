import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isOwningConfidence } from "@/lib/identity-match";

// True when the given Clerk user has CLAIMED this evaluation with an OWNER-grade
// (high-confidence) identity match (set by the /claim/callback flow). This is
// the server-side ownership gate for mutating a profile's data — re-scoring,
// recommendation ratings, score-item edits, etc. Anonymous viewers, signed-in
// users who haven't claimed the eval, and weak ("medium", name-only) claimers
// are NOT owners. See isOwningConfidence / signalConfidence for the policy.
export async function isEvalOwner(
  clerkUserId: string,
  evaluationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ matchConfidence: users.matchConfidence })
    .from(users)
    .where(
      and(eq(users.clerkUserId, clerkUserId), eq(users.evaluationId, evaluationId)),
    )
    .limit(1);
  return !!row && isOwningConfidence(row.matchConfidence);
}

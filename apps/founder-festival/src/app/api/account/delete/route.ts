import { NextResponse } from "next/server";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { deleteEvaluationsCascade } from "@/lib/profile-delete-cascade";

// POST /api/account/delete
//
// Deletes the signed-in user's account completely:
//   1. Find every claim row (users table) for this Clerk userId.
//   2. Collect the set of evaluation_ids that they OWN — i.e. evals where
//      THEIR claim row is the only high/medium-confidence claim. If the
//      eval has another claimer (rare but possible — e.g. someone else
//      claimed first, then this user also claimed via a different OAuth
//      provider), leave the eval intact and only drop this user's claim.
//   3. For owned evals: delete all dependent rows (badge_overrides,
//      score_items, recommendation_responses) then the eval itself.
//   4. Delete THIS user's claim rows from the users table.
//   5. Delete the Clerk user. That invalidates the session, so the
//      browser ends up signed out on the next page load.
//
// The endpoint is irreversible — the client should confirm before calling.
export async function POST() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Find every claim row this Clerk user has (usually 1 — but multi-provider
  // claimers can have a row per provider session id).
  const myClaims = await db
    .select({ id: users.id, evaluationId: users.evaluationId })
    .from(users)
    .where(eq(users.clerkUserId, userId));

  // Collect evaluation ids and decide which to delete vs. just-unclaim.
  // Delete = no OTHER claim row references it. Otherwise: just drop my
  // claim, leave the eval (the leaderboard, other claimers, etc. still
  // depend on it).
  const evalIdsToCheck = Array.from(
    new Set(
      myClaims
        .map((c) => c.evaluationId)
        .filter((id): id is string => id != null),
    ),
  );
  // ALSO collect evals matching this Clerk user's identity signals (LinkedIn
  // URL, GitHub username, verified email) — these are "theirs" in spirit
  // even if they never completed the claim flow. Without this, an
  // unclaimed eval scored for their LinkedIn URL would persist in cache
  // after delete and re-runs would return it instead of starting fresh.
  const user = await currentUser().catch(() => null);
  const identityEvalIds = new Set<string>();
  if (user) {
    // Collect every "handle" this Clerk identity goes by: their OAuth account
    // usernames (GitHub, LinkedIn) AND their Clerk username. A person's handle
    // is very often the same across LinkedIn / GitHub / our username (e.g.
    // "drodio"), so any of them is a strong signal for "this eval is theirs".
    const handles = new Set<string>();
    for (const a of user.externalAccounts ?? []) {
      const u = (a as { username?: string } | undefined)?.username;
      if (u) handles.add(u.toLowerCase());
    }
    if (user.username) handles.add(user.username.toLowerCase());

    // Match evals by handle against BOTH the stored githubUsername AND the
    // LinkedIn vanity handle in linkedin_url (anchored at the end, so
    // "/in/drodio" matches but "/in/drodio-jr" does not). This is what catches
    // the unclaimed orphan: a fresh eval the user ran for their own LinkedIn
    // but never completed the claim on — without it, re-running their URL
    // after delete just hits the cached row.
    for (const h of handles) {
      if (!h) continue;
      const rows = await db
        .select({ id: evaluations.id })
        .from(evaluations)
        .where(
          or(
            sql`lower(profile->>'githubUsername') = ${h}`,
            sql`lower(${evaluations.linkedinUrl}) like ${`%/in/${h}`}`,
            sql`lower(${evaluations.linkedinUrl}) like ${`%/in/${h}/`}`,
          ),
        );
      for (const r of rows) identityEvalIds.add(r.id);
    }

    // Verified emails matched against the eval's public email.
    const verifiedEmails = (user.emailAddresses ?? [])
      .filter((e) => e.verification?.status === "verified")
      .map((e) => e.emailAddress.toLowerCase());
    if (verifiedEmails.length > 0) {
      const rows = await db
        .select({ id: evaluations.id })
        .from(evaluations)
        .where(
          or(
            ...verifiedEmails.map(
              (em) => sql`lower(profile->>'publicEmail') = ${em}`,
            ),
          ),
        );
      for (const r of rows) identityEvalIds.add(r.id);
    }
  }

  // Merge claim-row eval ids with identity-match eval ids. Then per-eval
  // decide whether we can safely delete (no other claimer) or just-unclaim.
  const mergedToCheck = Array.from(
    new Set([...evalIdsToCheck, ...identityEvalIds]),
  );
  const evalIdsToDelete: string[] = [];
  if (mergedToCheck.length > 0) {
    const otherClaims = await db
      .select({ evaluationId: users.evaluationId, clerkUserId: users.clerkUserId })
      .from(users)
      .where(inArray(users.evaluationId, mergedToCheck));
    for (const evalId of mergedToCheck) {
      const claimers = otherClaims.filter((c) => c.evaluationId === evalId);
      const anyOther = claimers.some((c) => c.clerkUserId !== userId);
      if (!anyOther) evalIdsToDelete.push(evalId);
    }
  }

  // 1. Cascade-delete the evals we're tearing down (and all their dependents
  //    including any claim rows on them). Single source of truth lives in
  //    deleteEvaluationsCascade so the admin-delete path can't drift.
  if (evalIdsToDelete.length > 0) {
    await deleteEvaluationsCascade(evalIdsToDelete);
  }

  // 2. Drop any claim rows this user still has on evals OTHER people own.
  //    (Their owned-eval claim rows are already gone via the cascade above.)
  await db.delete(users).where(eq(users.clerkUserId, userId));

  // 4. Delete the Clerk user. Best-effort — if this fails we still consider
  //    the local data gone. The client redirects to "/" either way and the
  //    next call to currentUser() returns null because the session token
  //    is invalidated.
  let clerkDeleted = false;
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
    clerkDeleted = true;
  } catch (err) {
    console.error("[account-delete] Clerk deleteUser failed:", err);
  }

  return NextResponse.json({
    ok: true,
    evalsDeleted: evalIdsToDelete.length,
    claimsDeleted: myClaims.length,
    clerkDeleted,
  });
}

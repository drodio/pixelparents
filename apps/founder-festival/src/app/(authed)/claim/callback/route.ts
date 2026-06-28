import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { matchConfidence, signalConfidence, type ClerkClaim, type MatchProfile } from "@/lib/identity-match";
import { isUuid } from "@/lib/canonicalize";
import { CLAIM_EVAL_COOKIE } from "@/lib/claim-cookie";

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.redirect(new URL("/claim", req.url));

  const url = new URL(req.url);
  // Redirect that also clears the claim cookie. Used on EVERY exit once we've
  // read the cookie — including the early guards — so a stale/invalid cookie
  // can't ping-pong the user between home and here forever.
  const done = (target: URL) => {
    const res = NextResponse.redirect(target);
    res.cookies.delete(CLAIM_EVAL_COOKIE);
    return res;
  };

  // Prefer the explicit ?e= but fall back to the claim cookie — Clerk's OAuth
  // redirect chain frequently drops the query param, and without this the user
  // would be stranded on the home page (see src/lib/claim-cookie.ts).
  let evaluationId = url.searchParams.get("e");
  if (!isUuid(evaluationId)) {
    const cookieVal = (await cookies()).get(CLAIM_EVAL_COOKIE)?.value ?? null;
    if (isUuid(cookieVal)) evaluationId = cookieVal;
  }
  if (!isUuid(evaluationId)) return done(new URL("/", req.url));

  const [evalRow] = await db.select().from(evaluations).where(eq(evaluations.id, evaluationId)).limit(1);
  if (!evalRow) return done(new URL("/", req.url));

  // Tolerate stale-Clerk-session (deleted user 404). If the cookie points at
  // a userId Clerk no longer knows, treat them as signed-out and route to
  // /claim to re-authenticate.
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.redirect(new URL(`/claim?e=${evaluationId}`, req.url));

  const claim = toClerkClaim(user);
  const profileBlob = (evalRow.profile as MatchProfile | null) ?? null;
  const profile: MatchProfile | null = profileBlob
    ? {
        fullName: evalRow.fullName ?? profileBlob.fullName,
        primaryCompanyDomain: profileBlob.primaryCompanyDomain,
        publicEmail: profileBlob.publicEmail,
        githubUsername: profileBlob.githubUsername,
      }
    : (evalRow.fullName ? { fullName: evalRow.fullName } : null);

  const result = matchConfidence(claim, evalRow.linkedinUrl, profile);
  const ret = url.searchParams.get("return") ?? "welcome";
  const welcomeUrl = (extra: string) =>
    new URL(`/profile?e=${evaluationId}&${extra}`, req.url);

  if (result.kind === "match") {
    // SECURITY (P0-1): derive the stored confidence from the SIGNAL, not a
    // hardcoded "high". A LinkedIn name-only match (editable Clerk name vs a
    // public display name) yields "medium", which the ownership gates
    // (isOwningConfidence) reject — so it links the claim for display/dedup but
    // does NOT unlock re-scoring, recommendation edits, or private data.
    const confidence = signalConfidence(result.signal);
    // Clerk exposes the OAuth-supplied profile picture as `user.imageUrl`.
    // For LinkedIn claims this is the LinkedIn avatar; for GitHub it's
    // the GitHub avatar; for email-only it's Clerk's default initial.
    const clerkImageUrl = user.imageUrl ?? null;
    // Clerk username (when the user has set one in their account) drives
    // the canonical /profile/<username> URL. Null when they haven't picked
    // a username; will get filled in next time they re-claim.
    const clerkUsername = user.username ?? null;
    await db
      .insert(users)
      .values({
        clerkUserId: userId,
        evaluationId,
        verifiedAt: new Date(),
        verifiedVia: claim.provider,
        matchConfidence: confidence,
        verifiedSignal: result.signal,
        clerkImageUrl,
        clerkUsername,
      })
      .onConflictDoUpdate({
        target: users.clerkUserId,
        set: {
          evaluationId,
          verifiedAt: new Date(),
          // Never DOWNGRADE an existing owning (high) claim on the SAME eval. A
          // weaker re-auth (e.g. LinkedIn name-only → medium) must not demote a
          // user who already reached "high" — whether by email/GitHub proof, a
          // verify-to-own attestation, or the one-time grandfather of legacy
          // name-only claims. We keep the stored confidence/signal/via in that
          // case (`users.*` = the pre-update row); otherwise take the freshly
          // computed values. A re-auth onto a DIFFERENT eval recomputes
          // normally (the eval guard fails), so this never preserves stale high.
          matchConfidence: sql`CASE WHEN ${users.matchConfidence} = 'high' AND ${users.evaluationId} = ${evaluationId} THEN ${users.matchConfidence} ELSE ${confidence} END`,
          verifiedSignal: sql`CASE WHEN ${users.matchConfidence} = 'high' AND ${users.evaluationId} = ${evaluationId} THEN ${users.verifiedSignal} ELSE ${result.signal} END`,
          verifiedVia: sql`CASE WHEN ${users.matchConfidence} = 'high' AND ${users.evaluationId} = ${evaluationId} THEN ${users.verifiedVia} ELSE ${claim.provider} END`,
          clerkImageUrl,
          clerkUsername,
        },
      });
    // If they're missing email and/or phone, route through /account/setup
    // first so we can collect them for event alerts. The setup page
    // forwards to /profile (with claimed= preserved) once they've added
    // both or skipped both.
    const needsSetup =
      user.primaryEmailAddressId == null || user.primaryPhoneNumberId == null;
    if (needsSetup) {
      const u = new URL(`/account/setup?e=${evaluationId}`, req.url);
      // Stash the claim signal so /profile can still show the success banner
      // after setup completes.
      u.searchParams.set("from", "claim");
      u.searchParams.set("claimed", result.signal);
      return done(u);
    }
    if (ret === "welcome") {
      return done(welcomeUrl(`claimed=${result.signal}`));
    }
    return done(new URL("/verified", req.url));
  }

  // no-match branches
  if (claim.provider === "linkedin") {
    return done(welcomeUrl(`claim_mismatch=1`));
  }
  return done(welcomeUrl(`claim_failed=${claim.provider}`));
}

function toClerkClaim(user: NonNullable<Awaited<ReturnType<typeof currentUser>>>): ClerkClaim {
  const accounts = user.externalAccounts ?? [];
  // Clerk's externalAccount.provider may be "linkedin_oidc" OR "oauth_linkedin_oidc"
  // depending on SDK/instance — match with includes() to handle both.
  const linkedin = accounts.find((a) => a.provider.includes("linkedin"));
  if (linkedin) {
    return {
      provider: "linkedin",
      email: user.emailAddresses?.[0]?.emailAddress,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    };
  }
  const github = accounts.find((a) => a.provider.includes("github"));
  if (github) {
    return {
      provider: "github",
      githubUsername: (github as unknown as { username?: string }).username,
    };
  }
  const email = user.emailAddresses?.[0]?.emailAddress;
  return { provider: "email", email };
}

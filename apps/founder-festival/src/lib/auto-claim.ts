// Auto-claim — when a signed-in Clerk user lands on the site without a
// `users` row linking them to an evaluation, try to find a matching eval
// from their Clerk identity (GitHub username, LinkedIn URL, email) and
// create the claim row inline. Avoids the "you authed but I sent you to
// the splash" dead end when the /claim/callback redirect chain loses
// the `?e=<uuid>` query param mid-OAuth.
//
// Returns the matched evaluation id on success, or null when no high-
// confidence match exists.

import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import type { currentUser } from "@clerk/nextjs/server";

type ClerkUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export async function tryAutoClaim(
  clerkUserId: string,
  user: ClerkUser,
): Promise<{ evaluationId: string; signal: string } | null> {
  // 1. Don't overwrite an existing claim. If they already have one,
  //    the homepage redirect resolves it normally.
  const [existing] = await db
    .select({ evaluationId: users.evaluationId })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (existing?.evaluationId) return { evaluationId: existing.evaluationId, signal: "existing" };

  // 2. Collect candidate signals from the Clerk session.
  const githubUsername = pickExternalUsername(user, "oauth_github") ??
    pickExternalUsername(user, "github") ?? null;
  const linkedinUrl = pickExternalUrlMatching(user, /linkedin/i);
  // Verified primary email — only trust verified addresses.
  const verifiedEmail = pickVerifiedEmail(user);

  // 3. Hit the most-specific signals first.
  //    a. GitHub username → evals.profile->>'githubUsername'
  if (githubUsername) {
    const [row] = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(sql`lower(profile->>'githubUsername') = lower(${githubUsername})`)
      .limit(1);
    if (row) {
      await insertClaim({ clerkUserId, evaluationId: row.id, user, signal: "github-username" });
      return { evaluationId: row.id, signal: "github-username" };
    }
  }
  //    b. LinkedIn URL → exact match on evaluations.linkedin_url
  if (linkedinUrl) {
    const normalized = linkedinUrl.toLowerCase().replace(/\/$/, "");
    const [row] = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(sql`lower(${evaluations.linkedinUrl}) = ${normalized}`)
      .limit(1);
    if (row) {
      await insertClaim({ clerkUserId, evaluationId: row.id, user, signal: "linkedin-url" });
      return { evaluationId: row.id, signal: "linkedin-url" };
    }
  }
  //    c. Verified email → evals.profile->>'publicEmail' exact match
  //       (we don't fuzzy-match local parts here — that's the claim/callback's
  //       higher-confidence Tier A territory; auto-claim is more conservative.)
  if (verifiedEmail) {
    const [row] = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(sql`lower(profile->>'publicEmail') = lower(${verifiedEmail})`)
      .limit(1);
    if (row) {
      await insertClaim({ clerkUserId, evaluationId: row.id, user, signal: "email-exact" });
      return { evaluationId: row.id, signal: "email-exact" };
    }
  }

  return null;
}

function pickExternalUsername(user: ClerkUser, provider: string): string | null {
  for (const acct of user.externalAccounts ?? []) {
    if (acct.provider === provider || acct.verification?.strategy === provider) {
      const u = (acct as { username?: string }).username;
      if (u) return u;
    }
  }
  return null;
}

function pickExternalUrlMatching(user: ClerkUser, pattern: RegExp): string | null {
  for (const acct of user.externalAccounts ?? []) {
    // Clerk stores OIDC URLs under `publicMetadata.url`, `profileImageUrl`,
    // or as a custom claim. Most providers don't expose the vanity URL
    // directly; this is best-effort.
    const raw = (acct as { profileImageUrl?: string; identificationId?: string }).profileImageUrl;
    if (raw && pattern.test(raw)) return raw;
  }
  return null;
}

function pickVerifiedEmail(user: ClerkUser): string | null {
  const primaryId = user.primaryEmailAddressId;
  for (const e of user.emailAddresses ?? []) {
    if (e.id === primaryId && e.verification?.status === "verified") {
      return e.emailAddress;
    }
  }
  // Fallback: any verified email if no primary set.
  for (const e of user.emailAddresses ?? []) {
    if (e.verification?.status === "verified") return e.emailAddress;
  }
  return null;
}

async function insertClaim(opts: {
  clerkUserId: string;
  evaluationId: string;
  user: ClerkUser;
  signal: string;
}) {
  const { clerkUserId, evaluationId, user, signal } = opts;
  // Pick the OAuth provider from externalAccounts for verifiedVia. Falls
  // back to "email" if the user only has an email auth method.
  const provider = (user.externalAccounts?.[0]?.provider ?? "email")
    .replace(/^oauth_/, "");
  await db
    .insert(users)
    .values({
      clerkUserId,
      evaluationId,
      verifiedAt: new Date(),
      verifiedVia: provider,
      matchConfidence: "high",
      verifiedSignal: signal,
      clerkImageUrl: user.imageUrl ?? null,
      clerkUsername: user.username ?? null,
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        evaluationId,
        verifiedAt: new Date(),
        verifiedVia: provider,
        matchConfidence: "high",
        verifiedSignal: signal,
        clerkImageUrl: user.imageUrl ?? null,
        clerkUsername: user.username ?? null,
      },
    });
}

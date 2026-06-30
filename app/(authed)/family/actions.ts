"use server";

import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { primaryEmail } from "@/lib/clerk";
import { familyIdForEmail } from "@/lib/db/signups";
import { sanitizeSignupPatch, type SignupPatch } from "@/app/signup/actions";
import { countUserCommits } from "@/lib/github";
import { builderStatusOf, type BuilderStatus } from "@/lib/builder";
import {
  coerceShareVisibility,
  generateShareToken,
  type ShareVisibility,
} from "@/lib/share";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Securely edit ANY member of the caller's family (the caller, a co-parent, …).
//
// Security model — the write is authorized by FAMILY MEMBERSHIP, derived entirely
// server-side:
//   1. The CALLER is the signed-in Clerk session (currentUser → primaryEmail). We
//      NEVER accept a caller id from the client, so a client can't impersonate
//      another family.
//   2. We resolve the caller's family_id from THAT email (familyIdForEmail).
//   3. The patch is sanitized by the SAME shared helper patchSignup uses
//      (sanitizeSignupPatch) so a client can't smuggle out-of-range/extra columns.
//   4. The UPDATE is scoped `WHERE id = target AND family_id = caller's family_id`.
//      That WHERE clause IS the authorization (mirrors patchChild): a target that
//      isn't in the caller's family matches 0 rows, so the write is a silent no-op
//      and we return { ok: false }. The email is the identity key and is therefore
//      NOT editable here (the sanitizer would allow it, but the directory/login
//      mapping keys off it — we strip it before sanitizing).
export async function patchFamilyMember(
  targetSignupId: string,
  patch: SignupPatch,
): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(targetSignupId)) return { ok: false };

  // 1. Caller identity comes from the session — never the client.
  const user = await currentUser();
  const email = user ? primaryEmail(user) : null;
  if (!email) return { ok: false };

  // 2. The caller's family_id scopes every write.
  const callerFamilyId = await familyIdForEmail(email);
  if (!callerFamilyId) return { ok: false };

  // Email is the identity key (login + directory mapping); don't let it be edited
  // through the cross-account path even though the sanitizer would accept it.
  const { email: _ignoredEmail, ...editable } = patch;
  void _ignoredEmail;

  // 3. Sanitize with the shared helper (reads the TARGET row's extra for the
  // builderInterest/studentResourceOptIn read-modify-write merge).
  const set = await sanitizeSignupPatch(targetSignupId, editable);
  if (Object.keys(set).length === 0) return { ok: true };

  // 4. The family-scoped WHERE clause is the authorization. A non-member target
  // updates 0 rows -> { ok: false }.
  try {
    const updated = await getDb()
      .update(signups)
      .set(set)
      .where(and(eq(signups.id, targetSignupId), eq(signups.familyId, callerFamilyId)))
      .returning({ id: signups.id });
    return { ok: updated.length > 0 };
  } catch (err) {
    console.error("patchFamilyMember failed:", err);
    return { ok: false };
  }
}

// Resolve the caller's session → family_id, then load a TARGET row that must
// share that family. Returns the target's id + its `extra` so a builder action
// can do a read-modify-write merge. The family-membership match IS the
// authorization (mirrors patchFamilyMember) — a non-member target resolves null.
async function authorizedTarget(
  targetSignupId: string,
): Promise<{ id: string; familyId: string; extra: Record<string, unknown> } | null> {
  if (!UUID_RE.test(targetSignupId)) return null;

  const user = await currentUser();
  const email = user ? primaryEmail(user) : null;
  if (!email) return null;

  const callerFamilyId = await familyIdForEmail(email);
  if (!callerFamilyId) return null;

  const [row] = await getDb()
    .select({
      id: signups.id,
      familyId: signups.familyId,
      githubUsername: signups.githubUsername,
      extra: signups.extra,
    })
    .from(signups)
    .where(and(eq(signups.id, targetSignupId), eq(signups.familyId, callerFamilyId)))
    .limit(1);
  if (!row) return null;

  return {
    id: row.id,
    familyId: row.familyId,
    extra: (row.extra ?? {}) as Record<string, unknown>,
  };
}

// Count the target member's commits on the Pixel Parents repo and, if any are
// found, auto-set extra.builder=true + store the count + checkedAt. Authorized by
// FAMILY MEMBERSHIP (caller derived from the session; target must share the
// caller's family). Best-effort: the GitHub count never throws, and a 0 count
// records the check timestamp/count WITHOUT setting the auto flag (so an existing
// manual override is left intact). Returns the resulting effective status.
export async function refreshBuilderStatus(
  targetSignupId: string,
): Promise<{ ok: boolean; status?: BuilderStatus }> {
  const target = await authorizedTarget(targetSignupId);
  if (!target) return { ok: false };

  // Read the target's GitHub username off the authorized row.
  const [row] = await getDb()
    .select({ githubUsername: signups.githubUsername })
    .from(signups)
    .where(eq(signups.id, target.id))
    .limit(1);
  const username = row?.githubUsername ?? null;

  const contributions = await countUserCommits(username);
  const checkedAt = new Date().toISOString();

  // Read-modify-write so we never clobber sibling extra keys (notified,
  // approvalStatus, builderInterest, …). Only flip the auto flag ON when commits
  // are found — a later 0 count must not silently revoke a real builder.
  const nextExtra: Record<string, unknown> = {
    ...target.extra,
    githubContributions: contributions,
    githubCheckedAt: checkedAt,
  };
  if (contributions > 0) nextExtra.builder = true;

  try {
    await getDb().update(signups).set({ extra: nextExtra }).where(eq(signups.id, target.id));
    return { ok: true, status: builderStatusOf(nextExtra) };
  } catch (err) {
    console.error("refreshBuilderStatus failed:", err);
    return { ok: false };
  }
}

// Manually set (or clear) the builder override for a family member. Same
// family-scoped authorization as refreshBuilderStatus. Read-modify-write merge so
// other extra keys survive. Returns the resulting effective status.
export async function setBuilderManual(
  targetSignupId: string,
  on: boolean,
): Promise<{ ok: boolean; status?: BuilderStatus }> {
  const target = await authorizedTarget(targetSignupId);
  if (!target) return { ok: false };

  const nextExtra: Record<string, unknown> = {
    ...target.extra,
    builderManual: on === true,
  };

  try {
    await getDb().update(signups).set({ extra: nextExtra }).where(eq(signups.id, target.id));
    return { ok: true, status: builderStatusOf(nextExtra) };
  } catch (err) {
    console.error("setBuilderManual failed:", err);
    return { ok: false };
  }
}

export type FamilyVisibilityResult = { ok: boolean; visibility?: ShareVisibility };

// Set the share visibility of ANY member of the caller's family — so any family
// member (parent OR student account) can manage everyone's profile visibility.
//
// Security model — IDENTICAL to patchFamilyMember (the authorization is FAMILY
// MEMBERSHIP, derived entirely server-side; member ids are never trusted alone):
//   1. The CALLER is the signed-in Clerk session (currentUser → primaryEmail). We
//      never accept a caller id from the client.
//   2. We resolve the caller's family_id from THAT email (familyIdForEmail).
//   3. The visibility string is coerced to a known tier (coerceShareVisibility),
//      so a client can't smuggle an out-of-range value. Legacy "link" downgrades
//      to "ohs" — there is no publicly-viewable tier (see lib/share.ts).
//   4. The UPDATE is scoped `WHERE id = target AND family_id = caller's family_id`
//      — that WHERE clause IS the authorization (mirrors patchFamilyMember). A
//      target outside the caller's family matches 0 rows → silent no-op,
//      { ok: false }.
//
// share_enabled is derived from the tier (enabled unless "private"), and a
// share_token is minted on first enable and kept thereafter (mirrors how
// lib/share-actions.ts mints tokens), so re-enabling restores the same /p URL.
export async function setFamilyMemberVisibility(
  targetSignupId: string,
  visibility: string,
): Promise<FamilyVisibilityResult> {
  if (!UUID_RE.test(targetSignupId)) return { ok: false };

  // Coerce to a known tier server-side; never trust the raw client string.
  const tier = coerceShareVisibility(visibility);

  // 1. Caller identity comes from the session — never the client.
  const user = await currentUser();
  const email = user ? primaryEmail(user) : null;
  if (!email) return { ok: false };

  // 2. The caller's family_id scopes the write.
  const callerFamilyId = await familyIdForEmail(email);
  if (!callerFamilyId) return { ok: false };

  try {
    // Read the target's token, but ONLY for a row that shares the caller's family
    // — the family-membership match here IS the authorization (mirrors
    // authorizedTarget). A non-member resolves no row → no-op.
    const [row] = await getDb()
      .select({ token: signups.shareToken })
      .from(signups)
      .where(and(eq(signups.id, targetSignupId), eq(signups.familyId, callerFamilyId)))
      .limit(1);
    if (!row) return { ok: false };

    // Mint a token on first enable; keep an existing one so the URL is stable.
    const token = row.token ?? generateShareToken();

    // 4. The family-scoped WHERE clause is the authorization. share_enabled is
    // derived from the tier so the directory/`/p` gate stays consistent.
    const updated = await getDb()
      .update(signups)
      .set({
        shareVisibility: tier,
        shareEnabled: tier !== "private",
        shareToken: token,
      })
      .where(and(eq(signups.id, targetSignupId), eq(signups.familyId, callerFamilyId)))
      .returning({ id: signups.id });
    if (updated.length === 0) return { ok: false };

    revalidatePath(`/p/${token}`);
    return { ok: true, visibility: tier };
  } catch (err) {
    console.error("setFamilyMemberVisibility failed:", err);
    return { ok: false };
  }
}

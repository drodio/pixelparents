"use server";

import { eq, and } from "drizzle-orm";
import { currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { signups } from "@/lib/db/schema/signups";
import { primaryEmail } from "@/lib/clerk";
import { familyIdForEmail } from "@/lib/db/signups";
import { sanitizeSignupPatch, type SignupPatch } from "@/app/signup/actions";

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

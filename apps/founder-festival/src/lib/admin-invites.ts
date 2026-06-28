// Admin email-invite service layer.
//
// Two operations:
//   1. createInvite(...)   — generate a single-use token, store the row,
//                            (caller) sends the email with the link.
//   2. redeemInvite(token) — validate the signed-in user's verified Clerk
//                            emails contain the invited email, then mark
//                            the invite redeemed and create/update the
//                            admin_access row to status="approved".
//
// Tokens: 32 random bytes base64url-encoded → ~43 URL-safe chars. The
// uniqueness is enforced by the admin_invites_token_unique index.

import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { adminAccess, adminInvites, adminRoles } from "@/db/schema";

const EXPIRY_DAYS = 14;

function genToken(): string {
  return randomBytes(32).toString("base64url");
}

export type CreatedInvite = {
  id: string;
  email: string;
  token: string;
  roleId: string | null;
  roleName: string | null;
  expiresAt: Date;
};

export async function createAdminInvite(opts: {
  email: string;
  roleId: string | null;
  invitedByEmail: string;
  invitedByClerkUserId: string;
}): Promise<CreatedInvite> {
  const email = opts.email.trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    throw Object.assign(new Error("invalid_email"), { status: 400 });
  }
  let roleName: string | null = null;
  if (opts.roleId) {
    const [r] = await db
      .select({ id: adminRoles.id, name: adminRoles.name })
      .from(adminRoles)
      .where(eq(adminRoles.id, opts.roleId))
      .limit(1);
    if (!r) throw Object.assign(new Error("invalid_role"), { status: 400 });
    roleName = r.name;
  }

  const token = genToken();
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400 * 1000);
  const [row] = await db
    .insert(adminInvites)
    .values({
      email,
      roleId: opts.roleId,
      invitedByEmail: opts.invitedByEmail,
      invitedByClerkUserId: opts.invitedByClerkUserId,
      token,
      expiresAt,
    })
    .returning({ id: adminInvites.id });

  return {
    id: row!.id,
    email,
    token,
    roleId: opts.roleId,
    roleName,
    expiresAt,
  };
}

export type RedeemOutcome =
  | { ok: true; roleId: string | null; roleName: string | null; invitedByEmail: string }
  | { ok: false; code: "not_found" | "expired" | "already_redeemed" | "email_mismatch"; detail?: string };

// Redeem a token: validates the user is signed in and one of their VERIFIED
// emails matches the invited email (case-insensitive). On success: marks the
// invite redeemed and upserts admin_access for this Clerk user to
// status="approved" with the role assigned.
export async function redeemAdminInvite(opts: {
  token: string;
  clerkUserId: string;
  verifiedEmails: string[];
  recipientName: string | null;
  recipientImageUrl: string | null;
  recipientPrimaryEmail: string | null;
}): Promise<RedeemOutcome> {
  const [invite] = await db
    .select()
    .from(adminInvites)
    .where(eq(adminInvites.token, opts.token))
    .limit(1);

  if (!invite) return { ok: false, code: "not_found" };
  if (invite.redeemedAt) return { ok: false, code: "already_redeemed" };
  if (invite.expiresAt.getTime() < Date.now()) return { ok: false, code: "expired" };

  const want = invite.email.toLowerCase();
  const have = opts.verifiedEmails.map((e) => e.toLowerCase());
  if (!have.includes(want)) {
    return { ok: false, code: "email_mismatch", detail: invite.email };
  }

  // Mark redeemed first — if the access upsert later fails, the invite is
  // still spent (single-use) and the caller can fix admin_access manually.
  // Concurrent redemption: gated by the WHERE redeemedAt IS NULL clause +
  // the update result count.
  const updated = await db
    .update(adminInvites)
    .set({ redeemedAt: new Date(), redeemedByClerkUserId: opts.clerkUserId })
    .where(and(eq(adminInvites.id, invite.id), isNull(adminInvites.redeemedAt)))
    .returning({ id: adminInvites.id });
  if (updated.length === 0) return { ok: false, code: "already_redeemed" };

  // Upsert admin_access. If a row exists for this Clerk user, flip it to
  // approved with the new role; otherwise insert a fresh approved row.
  const [existing] = await db
    .select({ id: adminAccess.id })
    .from(adminAccess)
    .where(eq(adminAccess.clerkUserId, opts.clerkUserId))
    .limit(1);

  if (existing) {
    await db
      .update(adminAccess)
      .set({
        status: "approved",
        roleId: invite.roleId,
        decidedAt: new Date(),
        decidedByEmail: invite.invitedByEmail,
      })
      .where(eq(adminAccess.id, existing.id));
  } else {
    await db.insert(adminAccess).values({
      clerkUserId: opts.clerkUserId,
      email: opts.recipientPrimaryEmail ?? invite.email,
      name: opts.recipientName,
      imageUrl: opts.recipientImageUrl,
      status: "approved",
      roleId: invite.roleId,
      decidedAt: new Date(),
      decidedByEmail: invite.invitedByEmail,
    });
  }

  // Look up the role name for the success message.
  let roleName: string | null = null;
  if (invite.roleId) {
    const [r] = await db
      .select({ name: adminRoles.name })
      .from(adminRoles)
      .where(eq(adminRoles.id, invite.roleId))
      .limit(1);
    roleName = r?.name ?? null;
  }

  return { ok: true, roleId: invite.roleId, roleName, invitedByEmail: invite.invitedByEmail };
}

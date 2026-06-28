import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { db } from "@/db";
import { adminAccess, adminInvites, adminRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { IS_PROD_DB } from "../setup";
import { createAdminInvite, redeemAdminInvite } from "@/lib/admin-invites";

// DB-writing; uses the same skip-when-prod convention as our other suites.

const cleanupRoleIds: string[] = [];
const cleanupInviteIds: string[] = [];
const cleanupClerkIds: string[] = [];

async function seedRole(name: string): Promise<string> {
  const [r] = await db
    .insert(adminRoles)
    .values({ name, grants: [] })
    .returning({ id: adminRoles.id });
  cleanupRoleIds.push(r!.id);
  return r!.id;
}

afterAll(async () => {
  for (const id of cleanupInviteIds) await db.delete(adminInvites).where(eq(adminInvites.id, id));
  for (const id of cleanupClerkIds) await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  for (const id of cleanupRoleIds) await db.delete(adminRoles).where(eq(adminRoles.id, id));
});

describe.skipIf(IS_PROD_DB)("admin-invites service", () => {
  describe("createAdminInvite", () => {
    it("rejects invalid email", async () => {
      await expect(
        createAdminInvite({
          email: "not-an-email",
          roleId: null,
          invitedByEmail: "boss@example.com",
          invitedByClerkUserId: "u_boss",
        }),
      ).rejects.toThrow(/invalid_email/);
    });

    it("rejects an unknown role id", async () => {
      await expect(
        createAdminInvite({
          email: "guest@example.com",
          roleId: crypto.randomUUID(),
          invitedByEmail: "boss@example.com",
          invitedByClerkUserId: "u_boss",
        }),
      ).rejects.toThrow(/invalid_role/);
    });

    it("creates an invite with a unique URL-safe token and lowercased email", async () => {
      const roleId = await seedRole(`r_${crypto.randomUUID()}`);
      const a = await createAdminInvite({
        email: "  Guest@Example.com  ",
        roleId,
        invitedByEmail: "boss@example.com",
        invitedByClerkUserId: "u_boss",
      });
      cleanupInviteIds.push(a.id);
      expect(a.email).toBe("guest@example.com");
      expect(a.roleId).toBe(roleId);
      expect(a.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);

      const b = await createAdminInvite({
        email: "guest2@example.com",
        roleId: null,
        invitedByEmail: "boss@example.com",
        invitedByClerkUserId: "u_boss",
      });
      cleanupInviteIds.push(b.id);
      expect(b.token).not.toBe(a.token);
      expect(b.roleId).toBeNull();
      expect(b.roleName).toBeNull();
    });
  });

  describe("redeemAdminInvite", () => {
    it("rejects an unknown token", async () => {
      const r = await redeemAdminInvite({
        token: "not-a-real-token",
        clerkUserId: "u_x",
        verifiedEmails: ["x@example.com"],
        recipientName: null,
        recipientImageUrl: null,
        recipientPrimaryEmail: null,
      });
      expect(r).toEqual({ ok: false, code: "not_found" });
    });

    it("rejects when no verified email matches", async () => {
      const invite = await createAdminInvite({
        email: `match-${crypto.randomUUID()}@example.com`,
        roleId: null,
        invitedByEmail: "boss@example.com",
        invitedByClerkUserId: "u_boss",
      });
      cleanupInviteIds.push(invite.id);
      const r = await redeemAdminInvite({
        token: invite.token,
        clerkUserId: "u_intruder",
        verifiedEmails: ["someone-else@example.com"],
        recipientName: null,
        recipientImageUrl: null,
        recipientPrimaryEmail: null,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("email_mismatch");
    });

    it("matches case-insensitively + accepts the match + creates an approved admin_access row + marks redeemed", async () => {
      const inviteEmail = `caseuser-${crypto.randomUUID()}@example.com`;
      const invite = await createAdminInvite({
        email: inviteEmail,
        roleId: null,
        invitedByEmail: "boss@example.com",
        invitedByClerkUserId: "u_boss",
      });
      cleanupInviteIds.push(invite.id);
      const clerkUserId = `u_invitee_${crypto.randomUUID()}`;
      cleanupClerkIds.push(clerkUserId);

      const r = await redeemAdminInvite({
        token: invite.token,
        clerkUserId,
        verifiedEmails: [`OTHER@example.com`, inviteEmail.toUpperCase()],
        recipientName: "Pat",
        recipientImageUrl: null,
        recipientPrimaryEmail: inviteEmail,
      });
      expect(r.ok).toBe(true);

      // Invite marked redeemed.
      const [stored] = await db
        .select()
        .from(adminInvites)
        .where(eq(adminInvites.id, invite.id));
      expect(stored?.redeemedAt).not.toBeNull();
      expect(stored?.redeemedByClerkUserId).toBe(clerkUserId);

      // adminAccess row inserted as approved.
      const [aa] = await db
        .select()
        .from(adminAccess)
        .where(eq(adminAccess.clerkUserId, clerkUserId));
      expect(aa?.status).toBe("approved");
      expect(aa?.email).toBe(inviteEmail);
      expect(aa?.decidedByEmail).toBe("boss@example.com");
    });

    it("rejects a second redemption", async () => {
      const inviteEmail = `oneshot-${crypto.randomUUID()}@example.com`;
      const invite = await createAdminInvite({
        email: inviteEmail,
        roleId: null,
        invitedByEmail: "boss@example.com",
        invitedByClerkUserId: "u_boss",
      });
      cleanupInviteIds.push(invite.id);
      const clerkUserId = `u_${crypto.randomUUID()}`;
      cleanupClerkIds.push(clerkUserId);

      const first = await redeemAdminInvite({
        token: invite.token,
        clerkUserId,
        verifiedEmails: [inviteEmail],
        recipientName: null,
        recipientImageUrl: null,
        recipientPrimaryEmail: inviteEmail,
      });
      expect(first.ok).toBe(true);

      const second = await redeemAdminInvite({
        token: invite.token,
        clerkUserId,
        verifiedEmails: [inviteEmail],
        recipientName: null,
        recipientImageUrl: null,
        recipientPrimaryEmail: inviteEmail,
      });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.code).toBe("already_redeemed");
    });

    it("rejects an expired invite", async () => {
      // Insert one with an expires_at in the past directly so we don't have
      // to wait. createAdminInvite always uses +14d.
      const email = `expired-${crypto.randomUUID()}@example.com`;
      const [row] = await db
        .insert(adminInvites)
        .values({
          email,
          invitedByEmail: "boss@example.com",
          invitedByClerkUserId: "u_boss",
          token: `tok_${crypto.randomUUID()}`,
          expiresAt: new Date(Date.now() - 1000),
        })
        .returning();
      cleanupInviteIds.push(row!.id);

      const r = await redeemAdminInvite({
        token: row!.token,
        clerkUserId: `u_${crypto.randomUUID()}`,
        verifiedEmails: [email],
        recipientName: null,
        recipientImageUrl: null,
        recipientPrimaryEmail: email,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("expired");
    });
  });
});

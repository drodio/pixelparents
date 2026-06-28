import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orgBadges, adminOrgAssignments, badgeOverrides } from "@/db/schema";
import { isSuperAdmin } from "@/lib/admin";
import type { BadgeCategory } from "@/lib/badges";
import type { LeaderboardRow } from "@/lib/leaderboard";

// Custom badges owned by a host or sponsor (e.g. "District Member"), applied to
// scored profiles via badge_overrides. See the design spec.

export type OrgOwnerType = "host" | "sponsor";
export type OrgBadge = { id: string; ownerType: OrgOwnerType; ownerId: string; label: string };

// Custom org badges render as gold "identity"-style pills.
export const ORG_BADGE_CATEGORY: BadgeCategory = "identity";

// badge_overrides.badgeId for an org badge is namespaced so it never collides
// with a computed badge id.
export function orgBadgeOverrideId(orgBadgeId: string): string {
  return `org:${orgBadgeId}`;
}
export function parseOrgBadgeOverrideId(badgeId: string): string | null {
  return badgeId.startsWith("org:") ? badgeId.slice(4) : null;
}

function toOrgBadge(r: typeof orgBadges.$inferSelect): OrgBadge {
  return { id: r.id, ownerType: r.ownerType as OrgOwnerType, ownerId: r.ownerId, label: r.label };
}

export async function listOrgBadges(ownerType: OrgOwnerType, ownerId: string): Promise<OrgBadge[]> {
  const rows = await db
    .select()
    .from(orgBadges)
    .where(and(eq(orgBadges.ownerType, ownerType), eq(orgBadges.ownerId, ownerId)));
  return rows.map(toOrgBadge);
}

export async function createOrgBadge(ownerType: OrgOwnerType, ownerId: string, label: string): Promise<OrgBadge> {
  const [row] = await db
    .insert(orgBadges)
    .values({ ownerType, ownerId, label: label.trim() })
    .returning();
  return toOrgBadge(row!);
}

export async function deleteOrgBadge(id: string): Promise<void> {
  // Also drop any applied overrides for this badge so it disappears from profiles.
  await db.delete(badgeOverrides).where(eq(badgeOverrides.badgeId, orgBadgeOverrideId(id)));
  await db.delete(orgBadges).where(eq(orgBadges.id, id));
}

export async function getOrgBadgeById(id: string): Promise<OrgBadge | null> {
  const [row] = await db.select().from(orgBadges).where(eq(orgBadges.id, id)).limit(1);
  return row ? toOrgBadge(row) : null;
}

// ── Admin ↔ host/sponsor assignments ─────────────────────────────────────────
export type OrgAssignment = { ownerType: OrgOwnerType; ownerId: string };

export async function getAdminAssignments(clerkUserId: string): Promise<OrgAssignment[]> {
  const rows = await db
    .select({ ownerType: adminOrgAssignments.ownerType, ownerId: adminOrgAssignments.ownerId })
    .from(adminOrgAssignments)
    .where(eq(adminOrgAssignments.clerkUserId, clerkUserId));
  return rows.map((r) => ({ ownerType: r.ownerType as OrgOwnerType, ownerId: r.ownerId }));
}

// Replace an admin's assignments with the given set.
export async function setAdminAssignments(clerkUserId: string, assignments: OrgAssignment[]): Promise<void> {
  await db.delete(adminOrgAssignments).where(eq(adminOrgAssignments.clerkUserId, clerkUserId));
  const clean = assignments.filter((a) => a.ownerId && (a.ownerType === "host" || a.ownerType === "sponsor"));
  if (clean.length > 0) {
    await db
      .insert(adminOrgAssignments)
      .values(clean.map((a) => ({ clerkUserId, ownerType: a.ownerType, ownerId: a.ownerId })))
      .onConflictDoNothing();
  }
}

// ── Authorization ────────────────────────────────────────────────────────────
// Org badges the current viewer may apply: super-admins get all; other admins
// get only the badges of the hosts/sponsors they're assigned to.
export async function authorizedOrgBadges(): Promise<OrgBadge[]> {
  if (await isSuperAdmin()) {
    return (await db.select().from(orgBadges)).map(toOrgBadge);
  }
  const { userId } = await auth();
  if (!userId) return [];
  const assignments = await getAdminAssignments(userId);
  if (assignments.length === 0) return [];
  // Match any (ownerType, ownerId) the admin is assigned to.
  const all = (await db.select().from(orgBadges)).map(toOrgBadge);
  const keys = new Set(assignments.map((a) => `${a.ownerType}:${a.ownerId}`));
  return all.filter((b) => keys.has(`${b.ownerType}:${b.ownerId}`));
}

// Can the viewer apply this specific org badge? (Server-side gate for the bulk
// route — never trust the client.)
export async function canApplyOrgBadge(orgBadgeId: string): Promise<boolean> {
  const authorized = await authorizedOrgBadges();
  return authorized.some((b) => b.id === orgBadgeId);
}

// Can the current admin create/manage badges for THIS (ownerType, ownerId)?
// Super-admin → yes; otherwise only orgs the admin is explicitly assigned to.
// Gate for org-badge CREATE (the badge doesn't exist yet, so canApplyOrgBadge
// can't be used). Without this, any `manage_events` admin could mint badges on,
// and via canApplyOrgBadge's absence delete badges of, orgs they don't own.
export async function canManageOrg(ownerType: OrgOwnerType, ownerId: string): Promise<boolean> {
  if (await isSuperAdmin()) return true;
  const { userId } = await auth();
  if (!userId) return false;
  const assignments = await getAdminAssignments(userId);
  return assignments.some((a) => a.ownerType === ownerType && a.ownerId === ownerId);
}

// ── Apply / remove on profiles ───────────────────────────────────────────────
export async function applyOrgBadgeToProfiles(orgBadgeId: string, evaluationIds: string[]): Promise<void> {
  if (evaluationIds.length === 0) return;
  const badge = await getOrgBadgeById(orgBadgeId);
  if (!badge) return;
  const badgeId = orgBadgeOverrideId(orgBadgeId);
  await db
    .insert(badgeOverrides)
    .values(
      evaluationIds.map((evaluationId) => ({
        evaluationId,
        badgeId,
        status: "confirmed",
        editedLabel: badge.label,
      })),
    )
    .onConflictDoUpdate({
      target: [badgeOverrides.evaluationId, badgeOverrides.badgeId],
      set: { status: "confirmed", editedLabel: badge.label, updatedAt: new Date() },
    });
}

export async function removeOrgBadgeFromProfiles(orgBadgeId: string, evaluationIds: string[]): Promise<void> {
  if (evaluationIds.length === 0) return;
  await db
    .delete(badgeOverrides)
    .where(
      and(
        eq(badgeOverrides.badgeId, orgBadgeOverrideId(orgBadgeId)),
        inArray(badgeOverrides.evaluationId, evaluationIds),
      ),
    );
}

// Rename a badge: update the catalog label AND the editedLabel on every applied
// override so profiles show the new name.
export async function renameOrgBadge(id: string, label: string): Promise<OrgBadge | null> {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const [row] = await db.update(orgBadges).set({ label: trimmed }).where(eq(orgBadges.id, id)).returning();
  if (!row) return null;
  await db
    .update(badgeOverrides)
    .set({ editedLabel: trimmed, updatedAt: new Date() })
    .where(eq(badgeOverrides.badgeId, orgBadgeOverrideId(id)));
  return toOrgBadge(row);
}

// Leaderboard rows for everyone who currently has this org badge, score desc.
export async function listOrgBadgeHolders(orgBadgeId: string): Promise<LeaderboardRow[]> {
  const ovr = await db
    .select({ evaluationId: badgeOverrides.evaluationId })
    .from(badgeOverrides)
    .where(eq(badgeOverrides.badgeId, orgBadgeOverrideId(orgBadgeId)));
  const evalIds = [...new Set(ovr.map((o) => o.evaluationId))];
  if (evalIds.length === 0) return [];
  const { getLeaderboardRowsForEvalIds } = await import("@/lib/leaderboard");
  const rows = await getLeaderboardRowsForEvalIds(evalIds);
  rows.sort((a, b) => b.combinedScore - a.combinedScore);
  return rows;
}

// How many of the given profiles currently have this org badge applied (so the
// bulk UI can show applied/partial/none state).
export async function countAppliedOrgBadge(orgBadgeId: string, evaluationIds: string[]): Promise<number> {
  if (evaluationIds.length === 0) return 0;
  const rows = await db
    .select({ id: badgeOverrides.evaluationId })
    .from(badgeOverrides)
    .where(
      and(
        eq(badgeOverrides.badgeId, orgBadgeOverrideId(orgBadgeId)),
        inArray(badgeOverrides.evaluationId, evaluationIds),
      ),
    );
  return rows.length;
}

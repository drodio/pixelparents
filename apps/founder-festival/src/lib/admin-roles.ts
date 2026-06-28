import { db } from "@/db";
import { adminRoles, adminAccess } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { clampCostMultiplier } from "./cost-multiplier";
import { clampScope, type RoleScope } from "./role-scope";

export type AdminRoleRow = typeof adminRoles.$inferSelect;

// The approved admin's role membership: grants/costMultiplier/scopes. grants is
// the role's grant list, or null when approved but role-less (→ no access, see
// grants.ts). costMultiplier is null when role-less (→ ×1); scopes are null when
// role-less (→ "all"). Returns null when the user has no approved admin_access row.
export async function getRoleForClerkUser(
  clerkUserId: string,
): Promise<{
  grants: string[] | null;
  costMultiplier: number | null;
  usersScope: RoleScope | null;
  eventsScope: RoleScope | null;
} | null> {
  const [row] = await db
    .select({
      status: adminAccess.status,
      roleId: adminAccess.roleId,
      grants: adminRoles.grants,
      costMultiplier: adminRoles.costMultiplier,
      usersScope: adminRoles.usersScope,
      eventsScope: adminRoles.eventsScope,
    })
    .from(adminAccess)
    .leftJoin(adminRoles, eq(adminAccess.roleId, adminRoles.id))
    .where(eq(adminAccess.clerkUserId, clerkUserId))
    .limit(1);
  if (!row || row.status !== "approved") return null;
  return {
    grants: row.roleId ? (row.grants ?? []) : null,
    costMultiplier: row.roleId ? (row.costMultiplier ?? null) : null,
    usersScope: row.roleId ? clampScope(row.usersScope) : null,
    eventsScope: row.roleId ? clampScope(row.eventsScope) : null,
  };
}

export async function listRoles(): Promise<AdminRoleRow[]> {
  return db.select().from(adminRoles).orderBy(desc(adminRoles.createdAt));
}

export async function getRole(id: string): Promise<AdminRoleRow | null> {
  const [row] = await db.select().from(adminRoles).where(eq(adminRoles.id, id)).limit(1);
  return row ?? null;
}

export async function createRole(input: {
  name: string;
  grants: string[];
  costMultiplier?: number;
  usersScope?: string;
  eventsScope?: string;
}): Promise<AdminRoleRow> {
  const [row] = await db
    .insert(adminRoles)
    .values({
      name: input.name,
      grants: input.grants,
      costMultiplier: clampCostMultiplier(input.costMultiplier),
      usersScope: clampScope(input.usersScope),
      eventsScope: clampScope(input.eventsScope),
    })
    .returning();
  return row!;
}

export async function updateRole(
  id: string,
  patch: {
    name?: string;
    grants?: string[];
    costMultiplier?: number;
    usersScope?: string;
    eventsScope?: string;
  },
): Promise<AdminRoleRow | null> {
  const set: Record<string, unknown> = { ...patch, updatedAt: new Date() };
  if (patch.costMultiplier !== undefined) set.costMultiplier = clampCostMultiplier(patch.costMultiplier);
  if (patch.usersScope !== undefined) set.usersScope = clampScope(patch.usersScope);
  if (patch.eventsScope !== undefined) set.eventsScope = clampScope(patch.eventsScope);
  const [row] = await db.update(adminRoles).set(set).where(eq(adminRoles.id, id)).returning();
  return row ?? null;
}

export async function roleAssigneeCount(id: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(adminAccess).where(eq(adminAccess.roleId, id));
  return Number(row?.n ?? 0);
}

// Delete a role. Blocked ("in_use") if any admin still has it. Returns
// "deleted" | "in_use" | "not_found".
export async function deleteRole(id: string): Promise<"deleted" | "in_use" | "not_found"> {
  if ((await roleAssigneeCount(id)) > 0) return "in_use";
  const deleted = await db.delete(adminRoles).where(eq(adminRoles.id, id)).returning({ id: adminRoles.id });
  return deleted.length > 0 ? "deleted" : "not_found";
}

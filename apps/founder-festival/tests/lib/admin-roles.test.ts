import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/db";
import { adminRoles, adminAccess } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  createRole, updateRole, deleteRole, listRoles, roleAssigneeCount, getRoleForClerkUser,
} from "@/lib/admin-roles";

const roleIds: string[] = [];
const clerkIds: string[] = [];
afterEach(async () => {
  for (const id of clerkIds.splice(0)) await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  for (const id of roleIds.splice(0)) await db.delete(adminRoles).where(eq(adminRoles.id, id));
});
function track<T extends { id: string }>(r: T): T { roleIds.push(r.id); return r; }

describe("admin-roles CRUD", () => {
  it("creates, lists, updates a role", async () => {
    const role = track(await createRole({ name: `Vendor ${crypto.randomUUID()}`, grants: ["create_events"] }));
    expect(role.grants).toEqual(["create_events"]);
    const updated = await updateRole(role.id, { grants: ["create_events", "manage_events"] });
    expect(updated?.grants).toEqual(["create_events", "manage_events"]);
    const all = await listRoles();
    expect(all.some((r) => r.id === role.id)).toBe(true);
  });

  it("blocks deletion of a role that is assigned; allows when unassigned", async () => {
    const role = track(await createRole({ name: `Used ${crypto.randomUUID()}`, grants: [] }));
    const clerkUserId = `u_role_${crypto.randomUUID()}`;
    clerkIds.push(clerkUserId);
    await db.insert(adminAccess).values({ clerkUserId, status: "approved", roleId: role.id });

    expect(await roleAssigneeCount(role.id)).toBe(1);
    expect(await deleteRole(role.id)).toBe("in_use");

    await db.update(adminAccess).set({ roleId: null }).where(eq(adminAccess.clerkUserId, clerkUserId));
    expect(await deleteRole(role.id)).toBe("deleted");
    roleIds.splice(roleIds.indexOf(role.id), 1);
  });

  it("getRoleForClerkUser: role grants for roled, null sentinel for role-less, null for unknown", async () => {
    const role = track(await createRole({ name: `R ${crypto.randomUUID()}`, grants: ["run_scoring_jobs"] }));
    const roledId = `u_roled_${crypto.randomUUID()}`;
    const rolelessId = `u_roleless_${crypto.randomUUID()}`;
    clerkIds.push(roledId, rolelessId);
    await db.insert(adminAccess).values({ clerkUserId: roledId, status: "approved", roleId: role.id });
    await db.insert(adminAccess).values({ clerkUserId: rolelessId, status: "approved", roleId: null });

    expect((await getRoleForClerkUser(roledId))?.grants).toEqual(["run_scoring_jobs"]);
    expect((await getRoleForClerkUser(rolelessId))?.grants).toBeNull();
    expect(await getRoleForClerkUser(`u_none_${crypto.randomUUID()}`)).toBeNull();
  });
});

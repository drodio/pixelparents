import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { adminRoles } from "@/db/schema";
import { eq } from "drizzle-orm";

let canCreate = true;
let canEdit = true;
vi.mock("@/lib/grants", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/grants")>();
  return {
    ...actual,
    requireGrant: vi.fn(async (g: string) => {
      const ok = g === "create_roles" ? canCreate : g === "edit_roles" ? canEdit : false;
      if (!ok) throw Object.assign(new Error("Forbidden"), { status: 403 });
    }),
  };
});

import { POST } from "@/app/api/admin/roles/route";
import { PATCH, DELETE } from "@/app/api/admin/roles/[id]/route";

const roleIds: string[] = [];
beforeEach(() => { canCreate = true; canEdit = true; });
afterEach(async () => {
  for (const id of roleIds.splice(0)) await db.delete(adminRoles).where(eq(adminRoles.id, id));
});
function postReq(body: unknown) {
  return new Request("http://localhost/api/admin/roles", { method: "POST", body: JSON.stringify(body) });
}

describe("admin roles API", () => {
  it("POST creates a role (200) with create_roles grant", async () => {
    const res = await POST(postReq({ name: `Vendor ${crypto.randomUUID()}`, grants: ["create_events"] }));
    expect(res.status).toBe(200);
    const json = await res.json();
    roleIds.push(json.role.id);
    expect(json.role.grants).toEqual(["create_events"]);
  });

  it("POST 403 without create_roles", async () => {
    canCreate = false;
    const res = await POST(postReq({ name: "X", grants: [] }));
    expect(res.status).toBe(403);
  });

  it("POST 400 on missing name", async () => {
    const res = await POST(postReq({ grants: [] }));
    expect(res.status).toBe(400);
  });

  it("PATCH updates grants; DELETE removes an unused role", async () => {
    const create = await POST(postReq({ name: `R ${crypto.randomUUID()}`, grants: [] }));
    const id = (await create.json()).role.id as string;
    roleIds.push(id);

    const patched = await PATCH(
      new Request(`http://localhost/api/admin/roles/${id}`, { method: "PATCH", body: JSON.stringify({ grants: ["manage_events"] }) }),
      { params: Promise.resolve({ id }) },
    );
    expect(patched.status).toBe(200);
    const [row] = await db.select().from(adminRoles).where(eq(adminRoles.id, id));
    expect(row.grants).toEqual(["manage_events"]);

    const del = await DELETE(
      new Request(`http://localhost/api/admin/roles/${id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id }) },
    );
    expect(del.status).toBe(200);
    roleIds.splice(roleIds.indexOf(id), 1);
  });
});

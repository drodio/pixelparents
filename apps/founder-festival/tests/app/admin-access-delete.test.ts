import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { adminAccess } from "@/db/schema";
import { eq } from "drizzle-orm";

let mockIsSuper = true;

vi.mock("@/lib/admin", () => ({ isSuperAdmin: vi.fn(async () => mockIsSuper) }));
// The DELETE handler resolves the actor's Clerk id for the audit log; mock auth()
// (the real one pulls in `server-only` and throws in the node test env).
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(async () => ({ userId: "u_super" })) }));

import { DELETE } from "@/app/api/admin/access/[id]/route";

const cleanupIds: string[] = [];
async function seedApproved(): Promise<string> {
  const clerkUserId = `u_del_${crypto.randomUUID()}`;
  cleanupIds.push(clerkUserId);
  const [row] = await db
    .insert(adminAccess)
    .values({ clerkUserId, email: "a@test.dev", status: "approved" })
    .returning();
  return row.id;
}
function del(id: string) {
  return DELETE(new Request(`http://localhost/api/admin/access/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  mockIsSuper = true;
});
afterEach(async () => {
  for (const id of cleanupIds.splice(0)) {
    await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  }
});

describe("DELETE /api/admin/access/[id]", () => {
  it("deletes the row (200) and it is gone", async () => {
    const id = await seedApproved();
    const res = await del(id);
    expect(res.status).toBe(200);
    const rows = await db.select().from(adminAccess).where(eq(adminAccess.id, id));
    expect(rows.length).toBe(0);
  });

  it("403 when caller is not a super admin (and the row survives)", async () => {
    const id = await seedApproved();
    mockIsSuper = false;
    const res = await del(id);
    expect(res.status).toBe(403);
    const rows = await db.select().from(adminAccess).where(eq(adminAccess.id, id));
    expect(rows.length).toBe(1);
  });

  it("400 on a non-uuid id", async () => {
    const res = await del("not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("404 when the id is unknown", async () => {
    const res = await del(crypto.randomUUID());
    expect(res.status).toBe(404);
  });
});

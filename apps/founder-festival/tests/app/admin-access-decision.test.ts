import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { adminAccess, adminRoles } from "@/db/schema";
import { eq } from "drizzle-orm";

// Grant state is toggled per-test via mockAllowed. The route now gates on
// requireGrant("approve_admin_requests") from @/lib/grants.
let mockAllowed = true;

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "boss@test.dev" },
    emailAddresses: [{ emailAddress: "boss@test.dev" }],
  })),
}));
vi.mock("@/lib/grants", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/grants")>();
  return {
    ...actual,
    requireGrant: vi.fn(async () => {
      if (!mockAllowed) throw Object.assign(new Error("Forbidden"), { status: 403 });
    }),
  };
});

import { POST } from "@/app/api/admin/access/[id]/decision/route";

const cleanupIds: string[] = [];
const cleanupRoleIds: string[] = [];
async function seedPending(): Promise<string> {
  const clerkUserId = `u_dec_${crypto.randomUUID()}`;
  cleanupIds.push(clerkUserId);
  const [row] = await db
    .insert(adminAccess)
    .values({ clerkUserId, email: "p@test.dev", status: "pending" })
    .returning();
  return row.id;
}
async function seedRole(): Promise<string> {
  const [row] = await db
    .insert(adminRoles)
    .values({ name: `role_dec_${crypto.randomUUID()}`, grants: ["manage_events"] })
    .returning();
  cleanupRoleIds.push(row.id);
  return row.id;
}
function post(id: string, body: unknown) {
  return POST(
    new Request(`http://localhost/api/admin/access/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => { mockAllowed = true; });
afterEach(async () => {
  // Delete access rows first (they FK-reference admin_roles.role_id), then roles.
  for (const id of cleanupIds.splice(0)) {
    await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  }
  for (const id of cleanupRoleIds.splice(0)) {
    await db.delete(adminRoles).where(eq(adminRoles.id, id));
  }
});

describe("POST /api/admin/access/[id]/decision", () => {
  it("approves a pending row (records decidedByEmail + decidedAt)", async () => {
    const id = await seedPending();
    const res = await post(id, { decision: "approved" });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.id, id));
    expect(row.status).toBe("approved");
    expect(row.decidedByEmail).toBe("boss@test.dev");
    expect(row.decidedAt).not.toBeNull();
  });

  it("assigns the role when approving with a roleId", async () => {
    const id = await seedPending();
    const roleId = await seedRole();
    const res = await post(id, { decision: "approved", roleId });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.id, id));
    expect(row.status).toBe("approved");
    expect(row.roleId).toBe(roleId);
  });

  it("leaves roleId null when approving without a role (full access)", async () => {
    const id = await seedPending();
    const res = await post(id, { decision: "approved" });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.id, id));
    expect(row.roleId).toBeNull();
  });

  it("denies a pending row", async () => {
    const id = await seedPending();
    const res = await post(id, { decision: "denied" });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.id, id));
    expect(row.status).toBe("denied");
  });

  it("403 when caller is not a super admin (and does not change the row)", async () => {
    const id = await seedPending();
    mockAllowed = false;
    const res = await post(id, { decision: "approved" });
    expect(res.status).toBe(403);
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.id, id));
    expect(row.status).toBe("pending");
  });

  it("400 on an invalid decision", async () => {
    const id = await seedPending();
    const res = await post(id, { decision: "maybe" });
    expect(res.status).toBe(400);
  });

  it("400 on a non-uuid id", async () => {
    const res = await post("not-a-uuid", { decision: "approved" });
    expect(res.status).toBe(400);
  });

  it("404 when the id is unknown", async () => {
    const res = await post(crypto.randomUUID(), { decision: "approved" });
    expect(res.status).toBe(404);
  });
});

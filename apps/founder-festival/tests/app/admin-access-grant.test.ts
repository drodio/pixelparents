import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { adminAccess, adminRoles } from "@/db/schema";
import { eq } from "drizzle-orm";

let mockAllowed = true;
let clerkUser: { emailAddresses: { id: string; emailAddress: string }[]; primaryEmailAddressId: string | null; fullName: string | null; imageUrl: string | null } | null = {
  emailAddresses: [{ id: "e1", emailAddress: "target@test.dev" }],
  primaryEmailAddressId: "e1",
  fullName: "Target User",
  imageUrl: "https://img.test/t.png",
};

vi.mock("@/lib/grants", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/grants")>();
  return {
    ...actual,
    requireGrant: vi.fn(async () => {
      if (!mockAllowed) throw Object.assign(new Error("Forbidden"), { status: 403 });
    }),
  };
});
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: vi.fn(async () => {
        if (!clerkUser) throw new Error("not found");
        return clerkUser;
      }),
    },
  })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "boss@test.dev" },
    emailAddresses: [{ emailAddress: "boss@test.dev" }],
  })),
}));

import { POST } from "@/app/api/admin/access/grant/route";

const clerkIds: string[] = [];
const roleIds: string[] = [];
beforeEach(() => {
  mockAllowed = true;
  clerkUser = {
    emailAddresses: [{ id: "e1", emailAddress: "target@test.dev" }],
    primaryEmailAddressId: "e1",
    fullName: "Target User",
    imageUrl: "https://img.test/t.png",
  };
});
afterEach(async () => {
  for (const id of clerkIds.splice(0)) await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  for (const id of roleIds.splice(0)) await db.delete(adminRoles).where(eq(adminRoles.id, id));
});
function post(body: unknown) {
  return POST(new Request("http://localhost/api/admin/access/grant", { method: "POST", body: JSON.stringify(body) }));
}

describe("POST /api/admin/access/grant", () => {
  it("grants admin to a Clerk user (approved row with snapshot + role)", async () => {
    const clerkUserId = `u_grant_${crypto.randomUUID()}`;
    clerkIds.push(clerkUserId);
    const [role] = await db.insert(adminRoles).values({ name: `Vendor ${crypto.randomUUID()}`, grants: ["create_events"] }).returning();
    roleIds.push(role.id);

    const res = await post({ clerkUserId, roleId: role.id });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    expect(row.status).toBe("approved");
    expect(row.roleId).toBe(role.id);
    expect(row.email).toBe("target@test.dev"); // snapshotted from Clerk, not the client
    expect(row.name).toBe("Target User");
  });

  it("upserts: granting an existing (pending) row flips it to approved", async () => {
    const clerkUserId = `u_grant_${crypto.randomUUID()}`;
    clerkIds.push(clerkUserId);
    await db.insert(adminAccess).values({ clerkUserId, email: "old@test.dev", status: "pending" });
    const res = await post({ clerkUserId });
    expect(res.status).toBe(200);
    const rows = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    expect(rows.length).toBe(1); // no duplicate
    expect(rows[0].status).toBe("approved");
  });

  it("403 without the grant (and creates no row)", async () => {
    mockAllowed = false;
    const clerkUserId = `u_grant_${crypto.randomUUID()}`;
    clerkIds.push(clerkUserId);
    const res = await post({ clerkUserId });
    expect(res.status).toBe(403);
    const rows = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    expect(rows.length).toBe(0);
  });

  it("400 when clerkUserId is missing", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it("404 when the Clerk user does not exist", async () => {
    clerkUser = null;
    const res = await post({ clerkUserId: `u_missing_${crypto.randomUUID()}` });
    expect(res.status).toBe(404);
  });
});

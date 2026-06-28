import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { adminAccess } from "@/db/schema";
import { eq } from "drizzle-orm";

let mockUserId: string | null = "u_req_1";
let mockIsAdmin = false;

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: mockUserId })),
  currentUser: vi.fn(async () => ({
    id: mockUserId,
    fullName: "Req Tester",
    imageUrl: "https://img.test/x.png",
    primaryEmailAddress: { emailAddress: "req@test.dev" },
    emailAddresses: [{ emailAddress: "req@test.dev" }],
  })),
}));
vi.mock("@/lib/admin", () => ({ isAdmin: vi.fn(async () => mockIsAdmin) }));

import { POST } from "@/app/api/admin/access/request/route";

const cleanupIds: string[] = [];
beforeEach(() => {
  mockUserId = `u_req_${crypto.randomUUID()}`;
  cleanupIds.push(mockUserId);
  mockIsAdmin = false;
});
afterEach(async () => {
  for (const id of cleanupIds.splice(0)) {
    await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  }
});

describe("POST /api/admin/access/request", () => {
  it("creates a pending row for the signed-in caller", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("pending");

    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, mockUserId!));
    expect(row.status).toBe("pending");
    expect(row.email).toBe("req@test.dev");
    expect(row.name).toBe("Req Tester");
  });

  it("401 when not signed in", async () => {
    mockUserId = null;
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("no-op (status approved) when caller is already an admin", async () => {
    mockIsAdmin = true;
    const res = await POST();
    expect((await res.json()).status).toBe("approved");
    const rows = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, mockUserId!));
    expect(rows.length).toBe(0); // nothing written
  });
});

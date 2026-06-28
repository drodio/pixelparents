import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/db";
import { adminAccess } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  requestAdminAccess,
  getAdminAccessStatus,
  isApprovedAdmin,
  decideAdminAccess,
  deleteAdminAccess,
} from "@/lib/admin-access";

// Each test uses a unique clerk id so rows never collide with real data or
// each other; cleanup removes them.
const ids: string[] = [];
function freshId(): string {
  const id = `test_${crypto.randomUUID()}`;
  ids.push(id);
  return id;
}

afterEach(async () => {
  for (const id of ids.splice(0)) {
    await db.delete(adminAccess).where(eq(adminAccess.clerkUserId, id));
  }
});

describe("admin-access helpers", () => {
  it("requestAdminAccess inserts a pending row; status reads back pending", async () => {
    const clerkUserId = freshId();
    const status = await requestAdminAccess({
      clerkUserId, email: "x@test.dev", name: "X Test", imageUrl: null,
    });
    expect(status).toBe("pending");
    expect(await getAdminAccessStatus(clerkUserId)).toBe("pending");
    expect(await isApprovedAdmin(clerkUserId)).toBe(false);
  });

  it("getAdminAccessStatus is 'none' for an unknown user", async () => {
    expect(await getAdminAccessStatus(`test_${crypto.randomUUID()}`)).toBe("none");
  });

  it("decideAdminAccess approves a row; isApprovedAdmin becomes true", async () => {
    const clerkUserId = freshId();
    await requestAdminAccess({ clerkUserId, email: "a@test.dev", name: null, imageUrl: null });
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    const updated = await decideAdminAccess({ id: row.id, decision: "approved", decidedByEmail: "boss@test.dev" });
    expect(updated?.status).toBe("approved");
    expect(updated?.decidedByEmail).toBe("boss@test.dev");
    expect(updated?.decidedAt).not.toBeNull();
    expect(await isApprovedAdmin(clerkUserId)).toBe(true);
  });

  it("re-requesting after denial flips back to pending and clears the decision", async () => {
    const clerkUserId = freshId();
    await requestAdminAccess({ clerkUserId, email: "b@test.dev", name: null, imageUrl: null });
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    await decideAdminAccess({ id: row.id, decision: "denied", decidedByEmail: "boss@test.dev" });
    expect(await getAdminAccessStatus(clerkUserId)).toBe("denied");

    const status = await requestAdminAccess({ clerkUserId, email: "b@test.dev", name: null, imageUrl: null });
    expect(status).toBe("pending");
    const [after] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    expect(after.status).toBe("pending");
    expect(after.decidedAt).toBeNull();
    expect(after.decidedByEmail).toBeNull();
  });

  it("requesting when already approved is a no-op (stays approved)", async () => {
    const clerkUserId = freshId();
    await requestAdminAccess({ clerkUserId, email: "c@test.dev", name: null, imageUrl: null });
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    await decideAdminAccess({ id: row.id, decision: "approved", decidedByEmail: "boss@test.dev" });
    const status = await requestAdminAccess({ clerkUserId, email: "c@test.dev", name: null, imageUrl: null });
    expect(status).toBe("approved");
  });

  it("deleteAdminAccess removes the row (revokes access); unknown id returns false", async () => {
    const clerkUserId = freshId();
    await requestAdminAccess({ clerkUserId, email: "d@test.dev", name: null, imageUrl: null });
    const [row] = await db.select().from(adminAccess).where(eq(adminAccess.clerkUserId, clerkUserId));
    await decideAdminAccess({ id: row.id, decision: "approved", decidedByEmail: "boss@test.dev" });
    expect(await isApprovedAdmin(clerkUserId)).toBe(true);

    expect(await deleteAdminAccess(row.id)).toBe(true);
    expect(await getAdminAccessStatus(clerkUserId)).toBe("none");
    expect(await isApprovedAdmin(clerkUserId)).toBe(false);

    // Deleting again (now-unknown id) returns false.
    expect(await deleteAdminAccess(row.id)).toBe(false);
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { db } from "@/db";
import { evaluations, recommendationVisibility } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// /api/recommendations/visibility gates by (a) Clerk auth() userId and
// (b) isEvalOwner OR isAdmin. Mocking all three lets us flip caller identity
// per test without standing up a real Clerk session or a real users-row claim.
let mockUserId: string | null = null;
let mockIsOwner = false;
let mockIsAdmin = false;
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: mockUserId })),
}));
vi.mock("@/lib/authz", () => ({
  isEvalOwner: vi.fn(async () => mockIsOwner),
}));
vi.mock("@/lib/admin", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/admin")>();
  return { ...actual, isAdmin: vi.fn(async () => mockIsAdmin) };
});

import { POST } from "@/app/api/recommendations/visibility/route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/recommendations/visibility", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/recommendations/visibility", () => {
  // One real eval row to satisfy the FK on recommendation_visibility. Cleaned
  // up after the suite. We re-use it across tests; each test cleans its own
  // visibility rows.
  let evalId = "";

  beforeAll(async () => {
    const [ev] = await db
      .insert(evaluations)
      .values({
        linkedinUrl: `https://linkedin.com/in/visibility-test-${Date.now()}-${Math.random()}`,
        score: 0,
        founderScore: 0,
        investorScore: 0,
        signalQuality: "low",
        source: "url",
      })
      .returning({ id: evaluations.id });
    evalId = ev.id;
  });

  afterAll(async () => {
    await db
      .delete(recommendationVisibility)
      .where(eq(recommendationVisibility.evaluationId, evalId));
    await db.delete(evaluations).where(eq(evaluations.id, evalId));
  });

  beforeEach(async () => {
    mockUserId = null;
    mockIsOwner = false;
    mockIsAdmin = false;
    await db
      .delete(recommendationVisibility)
      .where(eq(recommendationVisibility.evaluationId, evalId));
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await post({ evaluationId: evalId, itemId: "x", visibility: "private" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated non-owner non-admin", async () => {
    mockUserId = "u_stranger";
    const res = await post({ evaluationId: evalId, itemId: "x", visibility: "private" });
    expect(res.status).toBe(403);
  });

  it("rejects bad visibility values", async () => {
    mockUserId = "u_owner";
    mockIsOwner = true;
    const res = await post({ evaluationId: evalId, itemId: "x", visibility: "weird" });
    expect(res.status).toBe(400);
  });

  it("rejects missing evaluationId / itemId", async () => {
    mockUserId = "u_owner";
    mockIsOwner = true;
    const r1 = await post({ itemId: "x", visibility: "private" });
    expect(r1.status).toBe(400);
    const r2 = await post({ evaluationId: evalId, visibility: "private" });
    expect(r2.status).toBe(400);
  });

  it("upserts a private row when the owner sets visibility=private", async () => {
    mockUserId = "u_owner";
    mockIsOwner = true;
    const res = await post({ evaluationId: evalId, itemId: "row-a", visibility: "private" });
    expect(res.status).toBe(200);
    const rows = await db
      .select()
      .from(recommendationVisibility)
      .where(
        and(
          eq(recommendationVisibility.evaluationId, evalId),
          eq(recommendationVisibility.itemId, "row-a"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].visibility).toBe("private");
  });

  it("is idempotent on repeated private writes", async () => {
    mockUserId = "u_owner";
    mockIsOwner = true;
    await post({ evaluationId: evalId, itemId: "row-b", visibility: "private" });
    await post({ evaluationId: evalId, itemId: "row-b", visibility: "private" });
    const rows = await db
      .select()
      .from(recommendationVisibility)
      .where(
        and(
          eq(recommendationVisibility.evaluationId, evalId),
          eq(recommendationVisibility.itemId, "row-b"),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("deletes the row when the owner flips back to public", async () => {
    mockUserId = "u_owner";
    mockIsOwner = true;
    await post({ evaluationId: evalId, itemId: "row-c", visibility: "private" });
    const before = await db
      .select()
      .from(recommendationVisibility)
      .where(eq(recommendationVisibility.itemId, "row-c"));
    expect(before).toHaveLength(1);

    const res = await post({ evaluationId: evalId, itemId: "row-c", visibility: "public" });
    expect(res.status).toBe(200);
    const after = await db
      .select()
      .from(recommendationVisibility)
      .where(eq(recommendationVisibility.itemId, "row-c"));
    expect(after).toHaveLength(0);
  });

  it("public is a no-op when no row exists", async () => {
    mockUserId = "u_owner";
    mockIsOwner = true;
    const res = await post({ evaluationId: evalId, itemId: "row-d", visibility: "public" });
    expect(res.status).toBe(200);
    const rows = await db
      .select()
      .from(recommendationVisibility)
      .where(eq(recommendationVisibility.itemId, "row-d"));
    expect(rows).toHaveLength(0);
  });

  it("admin can mutate visibility on a profile they don't own", async () => {
    mockUserId = "u_random_admin";
    mockIsOwner = false;
    mockIsAdmin = true;
    const res = await post({ evaluationId: evalId, itemId: "row-e", visibility: "private" });
    expect(res.status).toBe(200);
    const rows = await db
      .select()
      .from(recommendationVisibility)
      .where(eq(recommendationVisibility.itemId, "row-e"));
    expect(rows).toHaveLength(1);
  });
});

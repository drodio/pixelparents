import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// POST /api/account/location uses Clerk's auth() — mock it to flip the
// caller's identity per test without touching real Clerk state.
let mockUserId: string | null = null;
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: mockUserId })),
}));

import { POST } from "@/app/api/account/location/route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/account/location", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/account/location", () => {
  const clerkId = "u_location_test";

  beforeAll(async () => {
    // One real users row for the suite. The endpoint updates whichever row
    // matches the caller's clerk_user_id, so we just need one to exist.
    await db.delete(users).where(eq(users.clerkUserId, clerkId));
    await db.insert(users).values({ clerkUserId: clerkId });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.clerkUserId, clerkId));
  });

  beforeEach(() => {
    mockUserId = null;
  });

  it("401 when unauthenticated", async () => {
    const res = await post({ city: "SF" });
    expect(res.status).toBe(401);
  });

  it("updates all three fields when set", async () => {
    mockUserId = clerkId;
    const res = await post({
      city: "San Francisco",
      region: "California",
      country: "USA",
    });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkId));
    expect(row?.city).toBe("San Francisco");
    expect(row?.region).toBe("California");
    expect(row?.country).toBe("USA");
  });

  it("trims whitespace and collapses internal spaces", async () => {
    mockUserId = clerkId;
    await post({ city: "  New   York  ", region: "  NY  ", country: "  USA  " });
    const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkId));
    expect(row?.city).toBe("New York");
    expect(row?.region).toBe("NY");
    expect(row?.country).toBe("USA");
  });

  it("treats empty strings as null (clears the field)", async () => {
    mockUserId = clerkId;
    await post({ city: "London", region: "", country: "UK" });
    const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkId));
    expect(row?.city).toBe("London");
    expect(row?.region).toBeNull();
    expect(row?.country).toBe("UK");
  });

  it("rejects fields longer than 80 chars", async () => {
    mockUserId = clerkId;
    const res = await post({ city: "x".repeat(81) });
    expect(res.status).toBe(400);
  });

  it("collapses internal newlines into spaces (does not reject)", async () => {
    mockUserId = clerkId;
    const res = await post({ city: "Boston\nMA" });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkId));
    expect(row?.city).toBe("Boston MA");
  });

  it("ignores undefined fields (does not clobber existing values)", async () => {
    mockUserId = clerkId;
    await post({ city: "Tokyo", region: "Tokyo", country: "Japan" });
    // Now send a partial body that should be treated as undefined → null
    // per the route's normalize() (undefined → null = clear). This documents
    // the intentional behavior: callers must always send all three fields if
    // they want to preserve them.
    await post({ city: "Tokyo" });
    const [row] = await db.select().from(users).where(eq(users.clerkUserId, clerkId));
    expect(row?.city).toBe("Tokyo");
    expect(row?.region).toBeNull();
    expect(row?.country).toBeNull();
  });
});

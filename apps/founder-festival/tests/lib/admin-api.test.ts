import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

// Mutable mock state (declared before vi.mock; the factories close over these and
// read them at call time — same pattern as tests/app/retry-failed.test.ts).
let mockUserId: string | null = "u_super";
let mockIsSuper = true;
let mockRateOk = true;
let insertShouldThrow = false;
const inserted: Array<Record<string, unknown>> = [];

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: mockUserId })),
  currentUser: vi.fn(async () =>
    mockUserId
      ? {
          id: mockUserId,
          firstName: "Dan",
          lastName: "O",
          username: "drodio",
          emailAddresses: [
            { emailAddress: "drodio@gmail.com", verification: { status: "verified" } },
          ],
          primaryEmailAddress: { emailAddress: "drodio@gmail.com" },
        }
      : null,
  ),
}));
vi.mock("@/lib/admin", () => ({ isSuperAdmin: vi.fn(async () => mockIsSuper) }));
vi.mock("@/lib/rate-limit", () => ({
  checkAndIncrementRateLimit: vi.fn(async () => mockRateOk),
}));
vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        if (insertShouldThrow) throw new Error("relation admin_audit_log does not exist");
        inserted.push(v);
      },
    }),
  },
}));

import {
  requireSuperAdminApi,
  logAdminAction,
  tokenTypeOf,
  requestMeta,
} from "@/lib/admin-api";

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/admin/me", { method: "GET", headers });
}

beforeEach(() => {
  mockUserId = "u_super";
  mockIsSuper = true;
  mockRateOk = true;
  insertShouldThrow = false;
  inserted.length = 0;
});

describe("tokenTypeOf", () => {
  it("is bearer when an Authorization header is present, cookie otherwise", () => {
    expect(tokenTypeOf(req({ authorization: "Bearer x" }))).toBe("bearer");
    expect(tokenTypeOf(req())).toBe("cookie");
  });
});

describe("requestMeta", () => {
  it("extracts method, path, first x-forwarded-for ip, and token type", () => {
    const m = requestMeta(
      req({ authorization: "Bearer x", "x-forwarded-for": "1.2.3.4, 5.6.7.8", "user-agent": "Expo" }),
    );
    expect(m.method).toBe("GET");
    expect(m.path).toBe("/api/admin/me");
    expect(m.ip).toBe("1.2.3.4");
    expect(m.userAgent).toBe("Expo");
    expect(m.tokenType).toBe("bearer");
  });
});

describe("requireSuperAdminApi", () => {
  it("returns the caller context for a super admin", async () => {
    const r = await requireSuperAdminApi(req({ authorization: "Bearer tok" }));
    expect(r instanceof NextResponse).toBe(false);
    if (r instanceof NextResponse) throw new Error("unexpected response");
    expect(r.userId).toBe("u_super");
    expect(r.email).toBe("drodio@gmail.com");
    expect(r.name).toBe("Dan O");
    expect(r.tokenType).toBe("bearer");
  });

  it("401s an unauthenticated request and audits the denial", async () => {
    mockUserId = null;
    const r = await requireSuperAdminApi(req());
    expect(r instanceof NextResponse).toBe(true);
    expect((r as NextResponse).status).toBe(401);
    expect(inserted.at(-1)).toMatchObject({ status: 401, clerkUserId: null });
  });

  it("403s an authenticated NON-super-admin and audits the denial with the user id", async () => {
    mockIsSuper = false;
    const r = await requireSuperAdminApi(req({ authorization: "Bearer tok" }));
    expect((r as NextResponse).status).toBe(403);
    expect(inserted.at(-1)).toMatchObject({ status: 403, clerkUserId: "u_super" });
  });

  it("429s when the per-user rate limit is exceeded", async () => {
    mockRateOk = false;
    const r = await requireSuperAdminApi(req({ authorization: "Bearer tok" }));
    expect((r as NextResponse).status).toBe(429);
  });
});

describe("logAdminAction", () => {
  it("writes an audit row", async () => {
    await logAdminAction({ clerkUserId: "u1", email: "a@b.c", status: 200, request: requestMeta(req()) });
    expect(inserted.at(-1)).toMatchObject({ clerkUserId: "u1", status: 200 });
  });

  it("is fail-open: never throws when the DB write fails (e.g. table absent)", async () => {
    insertShouldThrow = true;
    await expect(
      logAdminAction({ clerkUserId: "u1", email: null, status: 200, request: requestMeta(req()) }),
    ).resolves.toBeUndefined();
  });
});

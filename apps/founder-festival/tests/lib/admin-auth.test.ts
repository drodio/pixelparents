import { describe, it, expect, vi, beforeEach } from "vitest";

// Controllable Clerk user + DB-approval for the unit under test.
let mockUser: unknown = null;
let approved = false;

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(async () => mockUser),
}));
vi.mock("@/lib/admin-access", () => ({
  isApprovedAdmin: vi.fn(async () => approved),
}));

import { isAdmin, isSuperAdmin, adminGate } from "@/lib/admin";

function userWith(emails: Array<{ email: string; verified: boolean }>, id = "u_1") {
  return {
    id,
    emailAddresses: emails.map((e) => ({
      emailAddress: e.email,
      verification: { status: e.verified ? "verified" : "unverified" },
    })),
    primaryEmailAddress: { emailAddress: emails[0]?.email },
  };
}

beforeEach(() => {
  mockUser = null;
  approved = false;
  process.env.ADMIN_EMAILS = "boot@test.dev";
});

describe("admin auth", () => {
  it("super admin: verified super-admin email passes isAdmin + isSuperAdmin", async () => {
    mockUser = userWith([{ email: "drodio@storytell.ai", verified: true }]);
    expect(await isSuperAdmin()).toBe(true);
    expect(await isAdmin()).toBe(true);
  });

  it("super-admin email that is NOT verified does not pass", async () => {
    mockUser = userWith([{ email: "drodio@gmail.com", verified: false }]);
    expect(await isSuperAdmin()).toBe(false);
    expect(await isAdmin()).toBe(false);
  });

  it("bootstrap ADMIN_EMAILS passes isAdmin but not isSuperAdmin", async () => {
    mockUser = userWith([{ email: "boot@test.dev", verified: true }]);
    expect(await isAdmin()).toBe(true);
    expect(await isSuperAdmin()).toBe(false);
  });

  it("DB-approved user passes isAdmin (not super)", async () => {
    mockUser = userWith([{ email: "nobody@test.dev", verified: true }]);
    approved = true;
    expect(await isAdmin()).toBe(true);
    expect(await isSuperAdmin()).toBe(false);
  });

  it("signed-out → not admin; adminGate returns ok:false with null email", async () => {
    mockUser = null;
    expect(await isAdmin()).toBe(false);
    const gate = await adminGate();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.email).toBeNull();
  });

  it("adminGate returns ok:true for an approved user", async () => {
    mockUser = userWith([{ email: "nobody@test.dev", verified: true }]);
    approved = true;
    expect((await adminGate()).ok).toBe(true);
  });

  it("adminGate returns ok:true for a verified super-admin email", async () => {
    mockUser = userWith([{ email: "drodio@storytell.ai", verified: true }]);
    expect((await adminGate()).ok).toBe(true);
  });

  it("only the VERIFIED email counts when a user has several (unverified super-admin + verified non-admin → not admin)", async () => {
    mockUser = userWith([
      { email: "drodio@gmail.com", verified: false },
      { email: "stranger@test.dev", verified: true },
    ]);
    expect(await isSuperAdmin()).toBe(false);
    expect(await isAdmin()).toBe(false);
    expect((await adminGate()).ok).toBe(false);
  });
});

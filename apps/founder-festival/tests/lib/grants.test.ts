import { describe, it, expect, vi, beforeEach } from "vitest";

let mockUser: unknown = null;
let approvedRoleGrants: string[] | null = null;
let approvedNoRole = false;
let approvedUsersScope: string | null = null;
let approvedEventsScope: string | null = null;

vi.mock("@clerk/nextjs/server", () => ({
  currentUser: vi.fn(async () => mockUser),
}));
vi.mock("@/lib/admin-roles", () => ({
  getRoleForClerkUser: vi.fn(async () => {
    if (approvedNoRole) {
      return { grants: null, costMultiplier: null, usersScope: null, eventsScope: null };
    }
    if (approvedRoleGrants) {
      return {
        grants: approvedRoleGrants,
        costMultiplier: 10,
        usersScope: approvedUsersScope,
        eventsScope: approvedEventsScope,
      };
    }
    return null;
  }),
}));

import { can, getViewerGrants, getViewerScopes, GRANTS } from "@/lib/grants";

function userWith(emails: Array<{ email: string; verified: boolean }>, id = "u_g") {
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
  approvedRoleGrants = null;
  approvedNoRole = false;
  approvedUsersScope = null;
  approvedEventsScope = null;
  process.env.ADMIN_EMAILS = "boot@test.dev";
});

describe("grants", () => {
  it("GRANTS catalog has the 9 documented keys", () => {
    expect(GRANTS.map((g) => g.key).sort()).toEqual(
      [
        "approve_admin_requests","create_events","create_roles","delete_events",
        "edit_roles","manage_events","manage_pending","run_scoring_jobs","view_profiles",
      ].sort(),
    );
  });

  it("every grant declares a category", () => {
    for (const g of GRANTS) {
      expect(["users", "events", "admin"]).toContain(g.category);
    }
  });

  it("super admin gets every grant", async () => {
    mockUser = userWith([{ email: "drodio@storytell.ai", verified: true }]);
    expect((await getViewerGrants()).length).toBe(GRANTS.length);
    expect(await can("run_scoring_jobs")).toBe(true);
    expect(await can("create_roles")).toBe(true);
  });

  it("bootstrap env admin gets every grant", async () => {
    mockUser = userWith([{ email: "boot@test.dev", verified: true }]);
    expect(await can("delete_events")).toBe(true);
  });

  it("approved admin with a role gets exactly that role's grants", async () => {
    mockUser = userWith([{ email: "vendor@test.dev", verified: true }]);
    approvedRoleGrants = ["create_events", "manage_events"];
    expect(await can("create_events")).toBe(true);
    expect(await can("manage_events")).toBe(true);
    expect(await can("delete_events")).toBe(false);
    expect(await can("run_scoring_jobs")).toBe(false);
    expect((await getViewerGrants()).sort()).toEqual(["create_events", "manage_events"]);
  });

  it("approved admin with NO role has no grants (no access until a role is assigned)", async () => {
    mockUser = userWith([{ email: "norole@test.dev", verified: true }]);
    approvedNoRole = true;
    expect(await can("run_scoring_jobs")).toBe(false);
    expect(await getViewerGrants()).toEqual([]);
  });

  it("signed-out user has no grants", async () => {
    mockUser = null;
    expect(await can("create_events")).toBe(false);
    expect(await getViewerGrants()).toEqual([]);
  });
});

describe("getViewerScopes", () => {
  it("super admins see all/all regardless of any role scope", async () => {
    mockUser = userWith([{ email: "drodio@storytell.ai", verified: true }]);
    expect(await getViewerScopes()).toEqual({ users: "all", events: "all" });
  });

  it("a signed-out user is all/all (nothing to scope)", async () => {
    mockUser = null;
    expect(await getViewerScopes()).toEqual({ users: "all", events: "all" });
  });

  it("a role's per-category scope is used for non-privileged admins", async () => {
    mockUser = userWith([{ email: "vendor@test.dev", verified: true }]);
    approvedRoleGrants = ["view_profiles"];
    approvedUsersScope = "theirs";
    approvedEventsScope = "all";
    expect(await getViewerScopes()).toEqual({ users: "theirs", events: "all" });
  });

  it("a no-role approved admin is all/all", async () => {
    mockUser = userWith([{ email: "norole@test.dev", verified: true }]);
    approvedNoRole = true;
    expect(await getViewerScopes()).toEqual({ users: "all", events: "all" });
  });
});

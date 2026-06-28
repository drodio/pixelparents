import { describe, it, expect } from "vitest";
import { ADMIN_NAV, visibleNavItems, isActiveNav, activeNavHref } from "@/lib/admin-nav";

describe("visibleNavItems", () => {
  it("shows always-on Credits & Spend plus items whose gating grant the viewer has", () => {
    // run_scoring_jobs gates Bulk Score (the new-job page); Credits & Spend
    // (/admin/spend) is always-on.
    expect(visibleNavItems(["run_scoring_jobs"]).map((i) => i.href).sort()).toEqual(
      ["/admin/profiles/new", "/admin/spend"],
    );
    // Events grants now also surface Hosts + Sponsors (moved into the left nav's
    // "Events" section from the /admin/events page's top buttons).
    expect(visibleNavItems(["manage_events"]).map((i) => i.href).sort()).toEqual(
      ["/admin/events", "/admin/hosts", "/admin/spend", "/admin/sponsors"],
    );
    // view_profiles gates BOTH the Scored Profiles roster and the Claimed
    // Profiles roster (same members-only visibility grant).
    expect(visibleNavItems(["view_profiles"]).map((i) => i.href).sort()).toEqual(
      ["/admin/claimed", "/admin/profiles", "/admin/spend"],
    );
  });

  it("shows Manage Events for ANY events grant", () => {
    expect(visibleNavItems(["create_events"]).map((i) => i.href)).toContain("/admin/events");
    expect(visibleNavItems(["delete_events"]).map((i) => i.href)).toContain("/admin/events");
  });

  it("shows Admin Roles for create_roles OR edit_roles", () => {
    expect(visibleNavItems(["create_roles"]).map((i) => i.href)).toContain("/admin/roles");
    expect(visibleNavItems(["edit_roles"]).map((i) => i.href)).toContain("/admin/roles");
  });

  it("Credits & Spend is always visible — even with no grants at all", () => {
    expect(visibleNavItems([]).map((i) => i.href)).toEqual(["/admin/spend"]);
  });

  it("shows everything for an all-grants super-admin viewer", () => {
    const all = ADMIN_NAV.flatMap((i) => i.anyGrant);
    expect(visibleNavItems(all, { superAdmin: true })).toHaveLength(ADMIN_NAV.length);
  });

  it("hides super-admin-only items from a non-super viewer, even with all grants", () => {
    const all = ADMIN_NAV.flatMap((i) => i.anyGrant);
    expect(visibleNavItems(all).map((i) => i.href)).not.toContain("/admin/email-options");
  });

  it("shows Email options to super-admins (regardless of grants)", () => {
    expect(visibleNavItems([], { superAdmin: true }).map((i) => i.href)).toContain("/admin/email-options");
  });
});

describe("isActiveNav", () => {
  it("matches the exact section and its nested routes", () => {
    expect(isActiveNav("/admin/profiles", "/admin/profiles")).toBe(true);
    expect(isActiveNav("/admin/profiles/abc-123", "/admin/profiles")).toBe(true);
  });

  it("does not match a different section or a prefix sibling", () => {
    expect(isActiveNav("/admin/events", "/admin/profiles")).toBe(false);
    expect(isActiveNav("/admin/profiles-extended", "/admin/profiles")).toBe(false); // not "/admin/profiles/…"
  });
});

describe("activeNavHref", () => {
  const hrefs = ADMIN_NAV.map((i) => i.href);
  it("picks the most specific (longest) matching item", () => {
    expect(activeNavHref("/admin/profiles/new", hrefs)).toBe("/admin/profiles/new");
    expect(activeNavHref("/admin/profiles/abc-123", hrefs)).toBe("/admin/profiles");
    expect(activeNavHref("/admin/profiles", hrefs)).toBe("/admin/profiles");
  });
  it("returns null when nothing matches", () => {
    expect(activeNavHref("/admin", hrefs)).toBeNull();
  });
});

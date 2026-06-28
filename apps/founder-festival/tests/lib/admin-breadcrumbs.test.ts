import { describe, it, expect } from "vitest";
import { buildAdminBreadcrumbs } from "@/lib/admin-breadcrumbs";

// Path-parsing behavior only — these paths never hit a DB resolver (no resolvable
// id segment), so the tests stay pure. Name resolution for events/hosts/sponsors/
// support is a thin DB lookup exercised in the app.
describe("buildAdminBreadcrumbs", () => {
  it("returns just Admin for the dashboard root", async () => {
    expect(await buildAdminBreadcrumbs("/admin")).toEqual([{ label: "Admin" }]);
  });

  it("labels a known collection", async () => {
    expect(await buildAdminBreadcrumbs("/admin/events")).toEqual([
      { label: "Admin", href: "/admin" },
      { label: "Events" },
    ]);
  });

  it("labels nested leaf sub-pages with links on the parents", async () => {
    expect(await buildAdminBreadcrumbs("/admin/events/new")).toEqual([
      { label: "Admin", href: "/admin" },
      { label: "Events", href: "/admin/events" },
      { label: "New" },
    ]);
  });

  it("shortens an unresolved uuid id segment", async () => {
    const crumbs = await buildAdminBreadcrumbs(
      "/admin/access/12345678-1234-1234-1234-1234567890ab",
    );
    expect(crumbs.map((c) => c.label)).toEqual(["Admin", "Access", "12345678…"]);
  });

  it("strips the query string and trailing slash", async () => {
    expect(await buildAdminBreadcrumbs("/admin/pending/?x=1")).toEqual([
      { label: "Admin", href: "/admin" },
      { label: "Pending" },
    ]);
  });

  it("title-cases an unknown segment", async () => {
    expect(await buildAdminBreadcrumbs("/admin/some-thing")).toEqual([
      { label: "Admin", href: "/admin" },
      { label: "Some Thing" },
    ]);
  });

  it("ignores non-admin paths", async () => {
    expect(await buildAdminBreadcrumbs("/account")).toEqual([]);
  });
});

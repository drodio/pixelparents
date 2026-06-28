import { describe, it, expect } from "vitest";
import { DOCS_NAV, DOC_PAGE_SLUGS, isDocPageSlug, docsActiveHref } from "@/lib/docs-nav";

describe("DOCS_NAV", () => {
  it("has the expected items in order with emoji + support last", () => {
    expect(DOCS_NAV.map((i) => i.slug)).toEqual([
      "quickstart", "profiles", "leaderboard", "account", "events", "support",
    ]);
    expect(DOCS_NAV.every((i) => i.emoji.length > 0)).toBe(true);
    expect(DOCS_NAV.at(-1)!.kind).toBe("support");
  });

  it("DOC_PAGE_SLUGS excludes the support action page", () => {
    expect(DOC_PAGE_SLUGS).toEqual(["quickstart", "profiles", "leaderboard", "account", "events"]);
    expect(isDocPageSlug("profiles")).toBe(true);
    expect(isDocPageSlug("support")).toBe(false);
    expect(isDocPageSlug("nope")).toBe(false);
  });
});

describe("docsActiveHref", () => {
  const hrefs = DOCS_NAV.map((i) => i.href);
  it("matches a doc section and its nested routes, longest-wins", () => {
    expect(docsActiveHref("/docs/profiles", hrefs)).toBe("/docs/profiles");
    expect(docsActiveHref("/docs/support/abc-123", hrefs)).toBe("/docs/support");
  });
  it("treats /docs (quickstart index) as an exact match only", () => {
    expect(docsActiveHref("/docs", hrefs)).toBe("/docs");
    // a nested page must NOT light up the index
    expect(docsActiveHref("/docs/events", hrefs)).toBe("/docs/events");
  });
  it("returns null when nothing matches", () => {
    expect(docsActiveHref("/leaderboard", hrefs)).toBeNull();
  });
});

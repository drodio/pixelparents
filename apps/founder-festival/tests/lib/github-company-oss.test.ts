import { describe, it, expect, vi, afterEach } from "vitest";
import { githubTopRepoPoints } from "@/lib/scoring";
import { orgLoginFromDomain, companyOrgTopRepo } from "@/lib/enrichers/github";

describe("githubTopRepoPoints (boosted 25x curve)", () => {
  it("scores 0 below 100 stars", () => {
    expect(githubTopRepoPoints(0)).toBe(0);
    expect(githubTopRepoPoints(99)).toBe(0);
  });
  it("rewards outlier OSS proportionally (round(25*log10(stars)))", () => {
    expect(githubTopRepoPoints(100)).toBe(50);
    expect(githubTopRepoPoints(1000)).toBe(75);
    expect(githubTopRepoPoints(10000)).toBe(100);
    expect(githubTopRepoPoints(100000)).toBe(125);
    // Meteor (~44.8k stars) lands a founder in the low-hundreds.
    expect(githubTopRepoPoints(44781)).toBe(116);
  });
  it("is higher than the old 20x curve at every tier (more for technical founders)", () => {
    const old = (s: number) => Math.round(20 * Math.log10(s));
    for (const s of [1000, 10000, 44781, 100000]) {
      expect(githubTopRepoPoints(s)).toBeGreaterThan(old(s));
    }
  });
});

describe("orgLoginFromDomain", () => {
  it("derives the org login from a company domain", () => {
    expect(orgLoginFromDomain("apollographql.com")).toBe("apollographql");
    expect(orgLoginFromDomain("meteor.com")).toBe("meteor");
    expect(orgLoginFromDomain("www.hashicorp.com")).toBe("hashicorp");
    expect(orgLoginFromDomain("https://www.vercel.com/")).toBe("vercel");
  });
  it("returns null for empty / malformed input", () => {
    expect(orgLoginFromDomain(null)).toBeNull();
    expect(orgLoginFromDomain("")).toBeNull();
  });
});

describe("companyOrgTopRepo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the org's top-starred repo from the GitHub search API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ items: [{ name: "apollo-client", stargazers_count: 19739 }] }),
      })),
    );
    const top = await companyOrgTopRepo("apollographql.com");
    expect(top).toEqual({ org: "apollographql", repo: "apollo-client", stars: 19739 });
  });

  it("returns null when the org has no matching repos (graceful degrade)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ items: [] }) })));
    expect(await companyOrgTopRepo("no-such-company-xyz.com")).toBeNull();
  });

  it("returns null on an API error rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    expect(await companyOrgTopRepo("apollographql.com")).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { nfxSearchTerms, nfxSlugCandidates } from "@/lib/enrichers/nfx";

// NFX's name search is near-exact, and the only fallback was a `first-last`
// slug guess. That missed DROdio entirely: his extracted name is "Daniel Rubén
// Odio" (0 NFX hits — the middle name breaks the match), his slug is the handle
// "drodio" (not "daniel-odio"). These builders add the two recovery paths.

describe("nfxSearchTerms", () => {
  it("adds a middle-name-dropped variant for 3+ token names", () => {
    // "Daniel Rubén Odio" returns 0 NFX hits; "Daniel Odio" returns hits.
    expect(nfxSearchTerms("Daniel Rubén Odio")).toEqual(["Daniel Rubén Odio", "Daniel Odio"]);
  });

  it("returns just the name (no variant) for a two-token name", () => {
    expect(nfxSearchTerms("Drew Bennett")).toEqual(["Drew Bennett"]);
  });
});

describe("nfxSlugCandidates", () => {
  it("tries the LinkedIn handle FIRST (it's the NFX slug for claimed profiles)", () => {
    const c = nfxSlugCandidates({ searchSlugs: [], fullName: "Daniel Rubén Odio", linkedinHandle: "drodio" });
    expect(c[0]).toBe("drodio"); // authoritative path — load this before guessing
    expect(c).toContain("daniel-odio"); // first-last fallback still present
  });

  it("dedupes when the handle also came back from search", () => {
    const c = nfxSlugCandidates({ searchSlugs: ["drodio"], fullName: "Daniel Rubén Odio", linkedinHandle: "drodio" });
    expect(c.filter((s) => s === "drodio")).toHaveLength(1);
  });

  it("works with no LinkedIn handle (search hit + fallback only)", () => {
    const c = nfxSlugCandidates({ searchSlugs: ["drew-bennett"], fullName: "Drew Bennett", linkedinHandle: null });
    expect(c).toContain("drew-bennett");
    expect(c).not.toContain(""); // no falsy entries
  });
});

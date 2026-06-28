import { describe, it, expect } from "vitest";
import { getTkmxBadge } from "@/lib/tkmx-badge";

const withEnrichment = (raw: unknown) => ({
  enrichments: [
    { source: "github", raw: { user: { login: "x" } } },
    { source: "hn-tokenmaxxing", raw },
  ],
});

describe("getTkmxBadge", () => {
  it("returns rank + username + profile URL for a ranked member", () => {
    const badge = getTkmxBadge(withEnrichment({ username: "DROdio", rank: 21, total_tokens_28d: 30900000000 }));
    expect(badge).toEqual({
      rank: 21,
      username: "DROdio",
      profileUrl: "https://tkmx.odio.dev/u/DROdio",
    });
  });

  it("preserves username case in the link", () => {
    const badge = getTkmxBadge(withEnrichment({ username: "DROdio", rank: 1 }));
    expect(badge?.profileUrl).toBe("https://tkmx.odio.dev/u/DROdio");
  });

  it("returns null for a listed-but-unranked member (no rank)", () => {
    expect(getTkmxBadge(withEnrichment({ username: "DROdio", rank: null }))).toBeNull();
  });

  it("returns null when there is no tkmx enrichment", () => {
    expect(getTkmxBadge({ enrichments: [{ source: "github", raw: {} }] })).toBeNull();
  });

  it("returns null for missing / malformed profile", () => {
    expect(getTkmxBadge(null)).toBeNull();
    expect(getTkmxBadge(undefined)).toBeNull();
    expect(getTkmxBadge({})).toBeNull();
    expect(getTkmxBadge({ enrichments: "nope" })).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { buildLeaderboardPayload } from "@/lib/api/leaderboard-payload";
import type { LeaderboardRow } from "@/lib/leaderboard";
import type { Badge } from "@/lib/badges";

const badge = (id: string, status: Badge["status"] = "likely"): Badge => ({
  id, label: id, category: "founder", status,
});

const row = (over: Partial<LeaderboardRow>): LeaderboardRow => ({
  id: "e1",
  linkedinUrl: "https://www.linkedin.com/in/x",
  fullName: "Ada L",
  nickname: null,
  founderScore: 120,
  investorScore: 0,
  combinedScore: 120,
  createdAt: new Date(0),
  claimedImageUrl: null,
  companyName: "Acme",
  companyUrl: "https://acme.com",
  profileHref: "/profile/ada",
  badges: [],
  founderStatus: null,
  investorStatus: null,
  canonicalIndustries: [],
  ...over,
});

describe("buildLeaderboardPayload", () => {
  it("emits snake_case curated rows and never the raw profile", () => {
    const out = buildLeaderboardPayload(
      [row({ badges: [badge("yc"), badge("ipo")], founderStatus: "current", investorStatus: "past", canonicalIndustries: ["ai-ml"] })],
      { sort: "combined", limit: 50 },
    );
    expect(out.results[0]).toEqual({
      linkedin_url: "https://www.linkedin.com/in/x",
      full_name: "Ada L",
      nickname: null,
      company_name: "Acme",
      company_url: "https://acme.com",
      profile_href: "/profile/ada",
      scores: { founder: 120, investor: 0, combined: 120 },
      badges: ["yc", "ipo"],
      founder_status: "current",
      investor_status: "past",
      canonical_industries: ["ai-ml"],
    });
    expect((out.results[0] as Record<string, unknown>).profile).toBeUndefined();
  });

  it("exposes the nickname separately while full_name stays the legal name", () => {
    const out = buildLeaderboardPayload([row({ fullName: "Daniel R. Odio", nickname: "DROdio" })], {
      sort: "combined",
      limit: 50,
    });
    expect(out.results[0].full_name).toBe("Daniel R. Odio");
    expect(out.results[0].nickname).toBe("DROdio");
  });

  it("excludes rejected badges from the badge id list", () => {
    const out = buildLeaderboardPayload(
      [row({ badges: [badge("yc"), badge("acquired", "rejected")] })],
      { sort: "combined", limit: 50 },
    );
    expect(out.results[0].badges).toEqual(["yc"]);
  });

  it("sets next_cursor only when a full page is returned, keyed by sort", () => {
    const page = Array.from({ length: 50 }, (_, i) =>
      row({ id: `e${i}`, founderScore: 200 - i, combinedScore: 100 - i }),
    );
    const full = buildLeaderboardPayload(page, { sort: "founder", limit: 50 });
    expect(full.next_cursor).not.toBeNull();
    // cursor encodes the LAST row's founder score (sort=founder) + id
    expect(full.next_cursor).toBe(
      Buffer.from(JSON.stringify({ s: 200 - 49, i: "e49" })).toString("base64url"),
    );

    const partial = buildLeaderboardPayload([row({})], { sort: "combined", limit: 50 });
    expect(partial.next_cursor).toBeNull();
  });

  it("returns empty results + null cursor for no rows", () => {
    const out = buildLeaderboardPayload([], { sort: "combined", limit: 50 });
    expect(out.results).toEqual([]);
    expect(out.next_cursor).toBeNull();
  });
});

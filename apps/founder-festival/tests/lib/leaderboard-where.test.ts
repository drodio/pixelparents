import { describe, it, expect } from "vitest";
import { buildLeaderboardWhere, parseLeaderboardFilter } from "@/lib/leaderboard";

const f = (q: string) => parseLeaderboardFilter(new URLSearchParams(q));

describe("buildLeaderboardWhere", () => {
  it("returns undefined when no facet is active", () => {
    expect(buildLeaderboardWhere(f("role=both"))).toBeUndefined();
    // role/sort alone are not facets
    expect(buildLeaderboardWhere(f("role=founder&sort=combined"))).toBeUndefined();
  });

  it("returns a condition when stage is set", () => {
    expect(buildLeaderboardWhere(f("stage=seed,series-a"))).toBeDefined();
  });

  it("returns a condition for outcome / raised / team / badge facets", () => {
    expect(buildLeaderboardWhere(f("outcome=ipo"))).toBeDefined();
    expect(buildLeaderboardWhere(f("raised_min=1000000"))).toBeDefined();
    expect(buildLeaderboardWhere(f("raised_max=5000000"))).toBeDefined();
    expect(buildLeaderboardWhere(f("team_min=10"))).toBeDefined();
    expect(buildLeaderboardWhere(f("badge=yc,partner"))).toBeDefined();
  });

  it("combines multiple facets", () => {
    expect(buildLeaderboardWhere(f("stage=seed&outcome=ipo&raised_min=1000000&badge=yc"))).toBeDefined();
  });
});

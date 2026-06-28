import { describe, it, expect } from "vitest";
import {
  STAGE_VALUES,
  OUTCOME_VALUES,
  parseLeaderboardFilter,
  tokenizeSearchQuery,
  type LeaderboardFilter,
} from "@/lib/leaderboard";

describe("filter constants", () => {
  it("exposes the canonical stage enum (no n/a)", () => {
    expect(STAGE_VALUES).toEqual([
      "idea", "pre-seed", "seed", "series-a", "series-b", "series-c+", "growth", "public", "acquired",
    ]);
  });
  it("exposes the outcome facet keys", () => {
    expect(OUTCOME_VALUES).toEqual(["ipo", "acquired", "unicorn"]);
  });
  it("LeaderboardFilter type is constructible with all facets", () => {
    const f: LeaderboardFilter = {
      role: "both", sort: "combined", direction: "highest", stages: ["seed"], outcomes: ["ipo"],
      badges: ["yc"], industries: ["fintech"], family: ["children"], raisedMin: 50_000, raisedMax: null, teamMin: null,
      limit: 50, cursor: null,
    };
    expect(f.role).toBe("both");
  });
});

describe("parseLeaderboardFilter", () => {
  const parse = (q: string) => parseLeaderboardFilter(new URLSearchParams(q));

  it("defaults to role=both, sort=combined, direction=highest, empty facets", () => {
    const f = parse("");
    expect(f.role).toBe("both");
    expect(f.sort).toBe("combined");
    expect(f.direction).toBe("highest");
    expect(f.stages).toEqual([]);
    expect(f.outcomes).toEqual([]);
    expect(f.badges).toEqual([]);
    expect(f.raisedMin).toBeNull();
    expect(f.raisedMax).toBeNull();
    expect(f.teamMin).toBeNull();
    expect(f.limit).toBe(50);
    expect(f.cursor).toBeNull();
  });

  it("parses csv facets and drops invalid members", () => {
    const f = parse("stage=seed,series-a,bogus&outcome=ipo,nope&badge=yc,partner,notabadge");
    expect(f.stages).toEqual(["seed", "series-a"]);
    expect(f.outcomes).toEqual(["ipo"]);
    expect(f.badges).toEqual(["yc", "partner"]);
  });

  it("derives default sort from role when sort is absent", () => {
    expect(parse("role=founder").sort).toBe("founder");
    expect(parse("role=investor").sort).toBe("investor");
    expect(parse("role=both").sort).toBe("combined");
  });

  it("honors an explicit valid sort and ignores an invalid one", () => {
    expect(parse("role=founder&sort=investor").sort).toBe("investor");
    expect(parse("role=founder&sort=garbage").sort).toBe("founder");
  });

  it("parses the `top` direction, defaulting to highest", () => {
    expect(parse("").direction).toBe("highest");
    expect(parse("top=lowest").direction).toBe("lowest");
    expect(parse("top=highest").direction).toBe("highest");
    // Anything other than the literal "lowest" falls back to highest.
    expect(parse("top=garbage").direction).toBe("highest");
    expect(parse("sort=investor&top=lowest").direction).toBe("lowest");
  });

  it("clamps limit to 1..100 and parses raised/team ints", () => {
    expect(parse("limit=999").limit).toBe(100);
    expect(parse("limit=0").limit).toBe(1);
    const f = parse("raised_min=1000000&raised_max=50000000&team_min=10");
    expect(f.raisedMin).toBe(1_000_000);
    expect(f.raisedMax).toBe(50_000_000);
    expect(f.teamMin).toBe(10);
  });

  it("ignores junk numeric params", () => {
    const f = parse("raised_min=abc&limit=xyz");
    expect(f.raisedMin).toBeNull();
    expect(f.limit).toBe(50);
  });

  it("accepts the full filterable badge taxonomy and drops unknown ids", () => {
    const f = parse("badge=claimed,first-founder,seed-focus,mm,on-neo,bogus");
    expect(f.badges).toEqual(["claimed", "first-founder", "seed-focus", "mm", "on-neo"]);
  });
});

describe("tokenizeSearchQuery", () => {
  it("splits on whitespace and drops empties", () => {
    expect(tokenizeSearchQuery("sam odio")).toEqual(["sam", "odio"]);
    expect(tokenizeSearchQuery("  multiple   spaces ")).toEqual(["multiple", "spaces"]);
    expect(tokenizeSearchQuery("solo")).toEqual(["solo"]);
    expect(tokenizeSearchQuery("   ")).toEqual([]);
  });
});

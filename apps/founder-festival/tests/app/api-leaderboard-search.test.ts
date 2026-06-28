import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/leaderboard", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/leaderboard")>();
  return { ...actual, searchLeaderboard: vi.fn() };
});

import { GET } from "@/app/api/leaderboard/search/route";
import { searchLeaderboard, type LeaderboardRow } from "@/lib/leaderboard";

const req = (q = "") => new Request(`https://x/api/leaderboard/search${q}`);

const fakeRow = (id: string): LeaderboardRow => ({
  id,
  linkedinUrl: `https://linkedin.com/in/${id}`,
  fullName: id,
  nickname: null,
  founderScore: 1,
  investorScore: 0,
  combinedScore: 1,
  createdAt: new Date(0),
  claimedImageUrl: null,
  companyName: null,
  companyUrl: null,
  profileHref: `/profile?e=${id}`,
  badges: [],
  founderStatus: null,
  investorStatus: null,
  canonicalIndustries: [],
});

beforeEach(() => vi.clearAllMocks());

describe("GET /api/leaderboard/search", () => {
  it("returns an empty list with no DB call when q is missing", async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(body.rows).toEqual([]);
    expect(body.query).toBe("");
    expect(vi.mocked(searchLeaderboard)).not.toHaveBeenCalled();
  });

  it("returns an empty list with no DB call when q is only whitespace", async () => {
    const res = await GET(req("?q=%20%20%20"));
    const body = await res.json();
    expect(body.rows).toEqual([]);
    expect(vi.mocked(searchLeaderboard)).not.toHaveBeenCalled();
  });

  it("delegates to searchLeaderboard with the trimmed query + parsed filter", async () => {
    vi.mocked(searchLeaderboard).mockResolvedValue([fakeRow("erika-anderson")]);
    const res = await GET(req("?q=%20Erika%20Anderson%20&role=founder&stage=seed"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe("Erika Anderson");
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].id).toBe("erika-anderson");

    const [filter, q] = vi.mocked(searchLeaderboard).mock.calls[0]!;
    expect(q).toBe("Erika Anderson");
    expect(filter.role).toBe("founder");
    expect(filter.stages).toEqual(["seed"]);
  });
});

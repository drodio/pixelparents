import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub the DB-touching parts of leaderboard.ts so the route runs without
// hitting Postgres. parseLeaderboardFilter stays real (we assert it parses
// our query string).
vi.mock("@/lib/leaderboard", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/leaderboard")>();
  return { ...actual, getLeaderboard: vi.fn() };
});

import { GET } from "@/app/api/leaderboard/page/route";
import { getLeaderboard, type LeaderboardRow } from "@/lib/leaderboard";

const req = (q = "") => new Request(`https://x/api/leaderboard/page${q}`);

const fakeRow = (id: string, score: number): LeaderboardRow => ({
  id,
  linkedinUrl: `https://linkedin.com/in/${id}`,
  fullName: id,
  nickname: null,
  founderScore: score,
  investorScore: 0,
  combinedScore: score,
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

describe("GET /api/leaderboard/page", () => {
  it("returns rows + a next cursor when the page is full", async () => {
    // Default parsed limit is 50 — return exactly 50 to trigger the cursor.
    const rows = Array.from({ length: 50 }, (_, i) => fakeRow(`r${i}`, 100 - i));
    vi.mocked(getLeaderboard).mockResolvedValue(rows);

    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toHaveLength(50);
    expect(typeof body.nextCursor).toBe("string");
    expect(body.nextCursor.length).toBeGreaterThan(0);
  });

  it("omits the next cursor when the page is short (end of list)", async () => {
    vi.mocked(getLeaderboard).mockResolvedValue([fakeRow("only", 1)]);
    const res = await GET(req("?limit=50"));
    const body = await res.json();
    expect(body.rows).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it("forwards filter params (role/sort/cursor) to getLeaderboard", async () => {
    vi.mocked(getLeaderboard).mockResolvedValue([]);
    await GET(req("?role=investor&sort=investor&stage=seed&limit=25"));
    const passed = vi.mocked(getLeaderboard).mock.calls[0]![0];
    expect(passed.role).toBe("investor");
    expect(passed.sort).toBe("investor");
    expect(passed.stages).toEqual(["seed"]);
    expect(passed.limit).toBe(25);
  });
});

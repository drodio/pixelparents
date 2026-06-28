import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth + rate limit; keep the real parseLeaderboardFilter but stub the DB
// query (getLeaderboard) so the route runs without touching Postgres.
vi.mock("@/lib/api-keys", () => ({ verifyApiKey: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkAndIncrementRateLimit: vi.fn() }));
vi.mock("@/lib/leaderboard", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/leaderboard")>();
  return { ...actual, getLeaderboard: vi.fn() };
});

import { GET } from "@/app/api/v1/leaderboard/route";
import { verifyApiKey } from "@/lib/api-keys";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { getLeaderboard } from "@/lib/leaderboard";

const req = (q = "") =>
  new Request(`https://x/api/v1/leaderboard${q}`, {
    headers: { authorization: "Bearer sk_festival_live_test" },
  });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/v1/leaderboard", () => {
  it("401 without a valid key", async () => {
    vi.mocked(verifyApiKey).mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("429 when rate-limited", async () => {
    vi.mocked(verifyApiKey).mockResolvedValue({ keyId: "k", clerkUserId: "u" });
    vi.mocked(checkAndIncrementRateLimit).mockResolvedValue(false);
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(vi.mocked(getLeaderboard)).not.toHaveBeenCalled();
  });

  it("200 with curated results, forwards the parsed filter", async () => {
    vi.mocked(verifyApiKey).mockResolvedValue({ keyId: "k", clerkUserId: "u" });
    vi.mocked(checkAndIncrementRateLimit).mockResolvedValue(true);
    vi.mocked(getLeaderboard).mockResolvedValue([]);

    const res = await GET(req("?role=founder&stage=seed&limit=10"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("next_cursor");

    const passed = vi.mocked(getLeaderboard).mock.calls[0]![0];
    expect(passed.role).toBe("founder");
    expect(passed.stages).toEqual(["seed"]);
    expect(passed.limit).toBe(10);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

let allowed = true;
vi.mock("@/lib/grants", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/grants")>();
  return {
    ...actual,
    requireGrant: vi.fn(async () => {
      if (!allowed) throw Object.assign(new Error("Forbidden"), { status: 403 });
    }),
  };
});

let searchImpl: (q: string) => Promise<unknown[]> = async () => [];
vi.mock("@/lib/leaderboard", () => ({
  parseLeaderboardFilter: () => ({}),
  searchLeaderboard: (_filter: unknown, q: string) => searchImpl(q),
}));

import { GET } from "@/app/api/admin/members/search/route";

function req(q?: string) {
  const url = "http://x/api/admin/members/search" + (q != null ? `?q=${encodeURIComponent(q)}` : "");
  return new Request(url);
}

beforeEach(() => {
  allowed = true;
  searchImpl = async () => [];
});

describe("GET /api/admin/members/search", () => {
  it("403s when the caller lacks manage_events", async () => {
    allowed = false;
    const res = await GET(req("john"));
    expect(res.status).toBe(403);
  });

  it("short-circuits (no search) for queries under 2 chars", async () => {
    searchImpl = async () => {
      throw new Error("searchLeaderboard should not be called");
    };
    const res = await GET(req("j"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ members: [] });
  });

  it("maps rows to {name, href}, prefers nickname, drops nameless/hrefless", async () => {
    searchImpl = async () => [
      { fullName: "Jordan Clarke", nickname: null, profileHref: "/profile/jc" },
      { fullName: "Mia Lin", nickname: "Mimi", profileHref: "/profile/jl" },
      { fullName: "", nickname: null, profileHref: "/x" }, // no name → dropped
      { fullName: "No Href", nickname: null, profileHref: "" }, // no href → dropped
    ];
    const res = await GET(req("jo"));
    expect(await res.json()).toEqual({
      members: [
        { name: "Jordan Clarke", href: "/profile/jc" },
        { name: "Mimi", href: "/profile/jl" },
      ],
    });
  });

  it("returns empty (200) when the search throws", async () => {
    searchImpl = async () => {
      throw new Error("db down");
    };
    const res = await GET(req("john"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ members: [] });
  });
});

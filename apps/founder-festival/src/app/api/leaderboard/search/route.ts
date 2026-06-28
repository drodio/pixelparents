import { NextResponse } from "next/server";
import {
  parseLeaderboardFilter,
  searchLeaderboard,
  type LeaderboardRow,
} from "@/lib/leaderboard";

export const dynamic = "force-dynamic";

// Internal search endpoint for the public /leaderboard UI. Same filter +
// role/sort surface as /api/leaderboard/page, plus a required `q` parameter.
// Empty / whitespace queries return an empty list (the client falls back to
// the paginated list when its search box is cleared).
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  if (q.length === 0) {
    return NextResponse.json({ rows: [] satisfies LeaderboardRow[], query: "" });
  }
  // parseLeaderboardFilter clamps limit to [1,100]; we ignore it (search uses
  // its own SEARCH_LIMIT internally).
  const filter = parseLeaderboardFilter(sp);
  const rows = await searchLeaderboard(filter, q);
  return NextResponse.json({ rows, query: q } satisfies {
    rows: LeaderboardRow[];
    query: string;
  });
}

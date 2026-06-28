import { NextResponse } from "next/server";
import { getLeaderboard, parseLeaderboardFilter, type LeaderboardRow } from "@/lib/leaderboard";
import { encodeCursor } from "@/lib/leaderboard-cursor";

export const dynamic = "force-dynamic";

// Internal pagination endpoint for the public /leaderboard UI. Same filter
// surface as /api/v1/leaderboard but: (1) no API key (this is same-origin only,
// and the data is already public via the page itself), (2) returns the full
// `LeaderboardRow` shape so the client can render avatars / scores / badges /
// permalinks without a second hop, and (3) emits `next_cursor` so the client
// can chain pages with an IntersectionObserver.
export async function GET(req: Request) {
  const filter = parseLeaderboardFilter(new URL(req.url).searchParams);
  const rows = await getLeaderboard(filter);

  // A full page implies there's likely more. Encode the last row's sort-key
  // and id as the next cursor — same scheme used by /api/v1/leaderboard.
  let nextCursor: string | null = null;
  if (rows.length === filter.limit && rows.length > 0) {
    const last = rows[rows.length - 1]!;
    const score =
      filter.sort === "founder" ? last.founderScore
      : filter.sort === "investor" ? last.investorScore
      : last.combinedScore;
    nextCursor = encodeCursor({ score, id: last.id });
  }
  return NextResponse.json({ rows, nextCursor } satisfies {
    rows: LeaderboardRow[];
    nextCursor: string | null;
  });
}

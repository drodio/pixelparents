import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { parseLeaderboardFilter, getLeaderboard } from "@/lib/leaderboard";
import { buildLeaderboardPayload } from "@/lib/api/leaderboard-payload";

export const dynamic = "force-dynamic";

// Free cached read of the public leaderboard. Per-key daily cap stops the whole
// scored DB being scraped row-by-row through pagination. Env-tunable.
const PER_DAY_LIMIT = Number(process.env.API_LEADERBOARD_PER_DAY_LIMIT) || 2000;

export async function GET(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }

  if (!(await checkAndIncrementRateLimit(`leaderboard:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json(
      { error: "rate_limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }

  // The shared parser clamps limit to 1..100 and decodes the opaque cursor, so
  // the API gets keyset pagination + facet filtering for free. The base gate,
  // facet WHERE, and cursor WHERE all live in getLeaderboard.
  const filter = parseLeaderboardFilter(new URL(req.url).searchParams);
  const rows = await getLeaderboard(filter);
  return NextResponse.json(
    buildLeaderboardPayload(rows, { sort: filter.sort, limit: filter.limit }),
  );
}

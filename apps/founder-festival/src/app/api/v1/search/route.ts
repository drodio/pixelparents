import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { checkAndIncrementRateLimit, withinGlobalDailyLimit } from "@/lib/rate-limit";
import { parseLeaderboardFilter, searchLeaderboard } from "@/lib/leaderboard";
import { toLeaderboardApiRow } from "@/lib/api/leaderboard-payload";

export const dynamic = "force-dynamic";

// Search is a free cached read; per-key daily cap stops scrape-by-search.
const PER_DAY_LIMIT = Number(process.env.API_SEARCH_PER_DAY_LIMIT) || 2000;
// Global daily circuit-breaker — keys are free to mint, so a per-key cap alone
// doesn't bound total search load. Backstops the query-complexity DoS.
const GLOBAL_PER_DAY = Number(process.env.API_SEARCH_GLOBAL_PER_DAY) || 20000;
// Cap the query string so a single request can't smuggle a huge token / pattern.
const MAX_Q_LEN = 200;

// GET /api/v1/search?q=<name|company>  — full-DB search across the same public
// leaderboard universe (low-signal / hidden / code-redeemed excluded). Accepts
// every leaderboard facet filter (role, sort, stage, outcome, badge, industry,
// raised_min/max, team_min) so a search can be scoped. Returns up to 100 public
// rows; not paginated (find-this-person is the dominant use case).
export async function GET(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }
  if (!(await checkAndIncrementRateLimit(`search:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json(
      { error: "rate_limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }
  if (!(await withinGlobalDailyLimit("api-search", GLOBAL_PER_DAY))) {
    return NextResponse.json(
      { error: "temporarily_unavailable", resetsAt: "midnight UTC" },
      { status: 503 },
    );
  }

  const sp = new URL(req.url).searchParams;
  const q = (sp.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json({ error: "missing q" }, { status: 400 });
  }
  if (q.length > MAX_Q_LEN) {
    return NextResponse.json({ error: "query too long", max: MAX_Q_LEN }, { status: 400 });
  }
  const filter = parseLeaderboardFilter(sp);
  const rows = await searchLeaderboard(filter, q);
  return NextResponse.json({ query: q, results: rows.map(toLeaderboardApiRow) });
}

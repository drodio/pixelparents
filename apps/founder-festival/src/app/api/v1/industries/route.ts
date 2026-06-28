import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { INDUSTRY_SLUGS, INDUSTRY_LABELS } from "@/lib/industries";

export const dynamic = "force-dynamic";

// Static taxonomy; a generous cap is just an abuse backstop.
const PER_DAY_LIMIT = Number(process.env.API_INDUSTRIES_PER_DAY_LIMIT) || 5000;

// GET /api/v1/industries — the canonical industry taxonomy. These are the exact
// slugs that appear in a profile's `canonical_industries` and the values the
// leaderboard `industry` filter accepts.
export async function GET(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }
  if (!(await checkAndIncrementRateLimit(`industries:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json(
      { error: "rate_limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }
  return NextResponse.json({
    industries: INDUSTRY_SLUGS.map((slug) => ({ slug, label: INDUSTRY_LABELS[slug] })),
  });
}

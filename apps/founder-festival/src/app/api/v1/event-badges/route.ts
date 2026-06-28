import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { listAllBadges } from "@/lib/event-badges-catalog";

export const dynamic = "force-dynamic";

const PER_DAY_LIMIT = Number(process.env.API_EVENT_BADGES_PER_DAY_LIMIT) || 5000;

// GET /api/v1/event-badges — the full event category-badge vocabulary. These are
// the exact `slug` values that appear on an event's `badges` and that the
// `/api/v1/events?badge=<slug>` filter accepts.
export async function GET(req: Request) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }
  if (!(await checkAndIncrementRateLimit(`event-badges:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json(
      { error: "rate_limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }
  const badges = await listAllBadges();
  return NextResponse.json({ badges: badges.map((b) => ({ name: b.name, slug: b.slug })) });
}

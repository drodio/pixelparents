import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { getPublicEventDetail } from "@/lib/api/events-payload";

export const dynamic = "force-dynamic";

const PER_DAY_LIMIT = Number(process.env.API_EVENTS_PER_DAY_LIMIT) || 2000;

// GET /api/v1/events/{slug} — one published event by slug, with its hosts,
// sponsors, public-tier photos, category badges, and public recap. 404 for
// unknown or draft events. Public fields only — no people rosters, no PII.
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const key = await verifyApiKey(req.headers.get("authorization"));
  if (!key) {
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  }
  if (!(await checkAndIncrementRateLimit(`events:${key.keyId}`, PER_DAY_LIMIT))) {
    return NextResponse.json(
      { error: "rate_limit", limit: PER_DAY_LIMIT, resetsAt: "midnight UTC" },
      { status: 429 },
    );
  }
  const { slug } = await ctx.params;
  const event = await getPublicEventDetail(slug);
  if (!event) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(event);
}

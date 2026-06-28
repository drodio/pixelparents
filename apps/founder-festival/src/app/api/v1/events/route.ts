import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { checkAndIncrementRateLimit } from "@/lib/rate-limit";
import { listPublicEvents } from "@/lib/api/events-payload";

export const dynamic = "force-dynamic";

const PER_DAY_LIMIT = Number(process.env.API_EVENTS_PER_DAY_LIMIT) || 2000;

// GET /api/v1/events — all published events (drafts excluded), newest first,
// each with its category badges. Optional `?badge=<slug>,<slug>` filters to
// events carrying ANY of those badges. Public fields only: no host email, no
// applicant data.
export async function GET(req: Request) {
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
  const badge = (new URL(req.url).searchParams.get("badge") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return NextResponse.json({ results: await listPublicEvents(badge) });
}

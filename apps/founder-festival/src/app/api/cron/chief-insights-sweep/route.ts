import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sweepChiefInsights } from "@/lib/chief-insights-sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Polls in-flight Chief insight generations (personalized learnings + attendee
// insights) and stores answers as they land (or fails stale ones). Runs every
// minute; each poll is a fast GET so the run stays well under the limit.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await sweepChiefInsights();
  return NextResponse.json({ ok: true, ...result });
}

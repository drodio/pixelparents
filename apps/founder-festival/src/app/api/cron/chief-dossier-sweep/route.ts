import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { sweepChiefDossiers } from "@/lib/chief-dossier-sweep";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Polls in-flight Chief "Deep Intelligence" dossiers and stores their public
// share link as they land (or fails + refunds stale ones). Runs every minute;
// each poll/share is a fast GET/POST so the run stays well under the limit.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await sweepChiefDossiers();
  return NextResponse.json({ ok: true, ...result });
}

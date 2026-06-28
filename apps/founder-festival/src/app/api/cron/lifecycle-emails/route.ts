import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runClaimWelcomePass, runDevApiWelcomePass } from "@/lib/welcome-email-sweep";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Sends lifecycle welcome emails (profile claim + dev-API signup). Each pass is
// a no-op unless its flag (CLAIM_WELCOME_EMAIL_ENABLED / DEV_API_WELCOME_EMAIL_
// ENABLED) is on, so this is safe to deploy before the backfill is enabled.
// Idempotent + retrying via the sent_emails table (see welcome-email-sweep.ts).
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const claim = await runClaimWelcomePass();
  const dev = await runDevApiWelcomePass();
  return NextResponse.json({ claim, dev });
}

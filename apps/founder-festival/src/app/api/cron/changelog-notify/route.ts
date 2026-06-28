import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { notifyNewChangelogEntries } from "@/lib/changelog";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Emails subscribers about any changelog entry that hasn't been notified yet,
// then marks it sent. The CI sync (changelog-sync workflow) inserts new entries
// as un-notified on each push to main; this cron delivers them from the app
// (where Resend lives). Historical/backfilled entries are pre-marked, so this
// never fires for them. Idempotent + safe to run on a schedule.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await notifyNewChangelogEntries();
  return NextResponse.json({ ok: true, ...result });
}

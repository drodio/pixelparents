import { NextResponse } from "next/server";
import { isNull, eq } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { changelogEntries, changelogSubscribers } from "@/lib/db/schema/changelog";
import { sendChangelogEmail } from "@/lib/changelog-email";
import { ensureChangelogTables } from "@/lib/changelog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Emails subscribers about any entries that haven't been notified yet, then
// marks them notified (idempotent). Run on a Vercel cron. Protected by
// CRON_SECRET (Vercel cron sends `Authorization: Bearer $CRON_SECRET`).
export async function GET(request: Request) {
  // Require CRON_SECRET — without it the endpoint would be a public email trigger.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured (CRON_SECRET unset)" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "no database" }, { status: 503 });

  await ensureChangelogTables();
  const db = getDb();
  const pending = await db
    .select()
    .from(changelogEntries)
    .where(isNull(changelogEntries.notifiedAt));
  if (pending.length === 0) return NextResponse.json({ sent: 0, entries: 0 });

  const subs = await db
    .select()
    .from(changelogSubscribers)
    .where(isNull(changelogSubscribers.unsubscribedAt));

  let sent = 0;
  for (const entry of pending) {
    let entrySent = 0;
    for (const s of subs) {
      if (await sendChangelogEmail(s.email, entry, s.unsubscribeToken)) entrySent++;
    }
    sent += entrySent;
    // Only mark notified once it actually went out (or there's no one to email),
    // so an unconfigured/erroring Resend doesn't silently drop the notification.
    if (entrySent > 0 || subs.length === 0) {
      await db
        .update(changelogEntries)
        .set({ notifiedAt: new Date() })
        .where(eq(changelogEntries.id, entry.id));
    }
  }
  return NextResponse.json({ entries: pending.length, subscribers: subs.length, sent });
}

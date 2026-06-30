import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { importOhsCalendar } from "@/lib/events/import-ohs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Idempotent OHS school-year calendar import. Fetches the OHS gateway page, parses
// the school-year events, and upserts them as source='ohs' (read-only) events. Re-
// running never duplicates (upsert on external_key). Falls back to a curated seed
// when the page is unreachable/unparseable, so the calendar is always populated.
//
// Guarded by CRON_SECRET — Vercel cron sends `Authorization: Bearer $CRON_SECRET`.
// Without the secret set this endpoint is disabled (503) so it can never be a
// public write trigger.
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "import not configured (CRON_SECRET unset)" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasDatabase()) return NextResponse.json({ error: "no database" }, { status: 503 });

  try {
    const result = await importOhsCalendar();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("OHS import failed:", err);
    return NextResponse.json({ ok: false, error: "import failed" }, { status: 500 });
  }
}

// Vercel cron issues GET; allow POST too for manual/admin triggering.
export const GET = run;
export const POST = run;

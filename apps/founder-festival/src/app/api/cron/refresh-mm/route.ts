import { NextResponse } from "next/server";
import { loadCsvIntoNeon } from "@/lib/mm-loader";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const maxDuration = 300;

// Housekeeping: the rate_limit table accumulates one row per (ip, day) forever.
// Counters older than 2 days are dead weight (limits reset at midnight UTC).
// Folded into this weekly cron so the table can't grow unbounded. Best-effort —
// a cleanup failure must not fail the MM refresh.
async function pruneRateLimit(): Promise<number> {
  try {
    const res = await db.execute(
      sql`DELETE FROM rate_limit WHERE day < (CURRENT_DATE - INTERVAL '2 days')`,
    );
    return (res as unknown as { rowCount?: number }).rowCount ?? 0;
  } catch {
    return 0;
  }
}

export async function GET(req: Request) {
  const secret = process.env.MM_REFRESH_SECRET ?? process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = "https://downloads.majestic.com/majestic_million.csv";
  // Bounds connect/time-to-first-byte; the timer is cleared once headers arrive,
  // so the large CSV body download itself is not cut off mid-stream.
  const res = await fetchWithTimeout(url);
  if (!res.ok) return NextResponse.json({ error: `fetch failed: ${res.status}` }, { status: 502 });
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(tmpdir(), `mm-${Date.now()}.csv`);
  await writeFile(tmpPath, buf);

  const n = await loadCsvIntoNeon(tmpPath);
  const prunedRateLimit = await pruneRateLimit();
  return NextResponse.json({ ok: true, rows: n, prunedRateLimit });
}

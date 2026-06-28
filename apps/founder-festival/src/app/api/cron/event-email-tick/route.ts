import { NextResponse } from "next/server";
import { drainScheduledCampaigns } from "@/lib/event-email-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Drains due scheduled event-email campaigns (status=scheduled, scheduled_for in
// the past). Runs every minute on prod (vercel.json). Bearer-authed with
// CRON_SECRET so only Vercel's scheduler can invoke it.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const results = await drainScheduledCampaigns();
    const sent = results.reduce((n, r) => n + r.sent, 0);
    return NextResponse.json({ ok: true, campaigns: results.length, sent, results });
  } catch (err) {
    console.error("[event-email-tick] failed", err);
    return NextResponse.json({ error: "tick_failed" }, { status: 500 });
  }
}

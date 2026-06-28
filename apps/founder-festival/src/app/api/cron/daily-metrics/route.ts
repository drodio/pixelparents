import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { posthogReadConfigured } from "@/lib/posthog-query";
import { gatherDailyMetrics } from "@/lib/daily-metrics";
import { renderDailyMetricsEmail } from "@/lib/daily-metrics-email";
import { alertConfigured, sendAdminAlert } from "@/lib/admin-alert";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Daily site-health digest. Scheduled for 3am Pacific via vercel.json
// (0 10 * * * UTC); reports on the most recent COMPLETE Pacific day, which at
// 3am is still yesterday in full. Reuses the read-only PostHog
// key (POSTHOG_SECRET) and the Resend admin-alert sender.
//
// `?dry=1` returns the gathered metrics + rendered subject as JSON WITHOUT
// sending — used to validate against live data before/without emailing.
const DIGEST_TO = process.env.METRICS_DIGEST_EMAIL ?? "drodio@festival.so";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!posthogReadConfigured()) {
    return NextResponse.json({ skipped: "POSTHOG_SECRET not set" }, { status: 200 });
  }

  const dry = new URL(req.url).searchParams.get("dry") === "1";

  let metrics;
  try {
    metrics = await gatherDailyMetrics();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "gather failed", detail: msg }, { status: 502 });
  }

  const { subject, html } = renderDailyMetricsEmail(metrics);

  if (dry) {
    // Allow previewing the rendered email itself: ?dry=1&html=1 returns the
    // HTML directly (open in a browser); otherwise return the structured JSON.
    if (new URL(req.url).searchParams.get("html") === "1") {
      return new NextResponse(html, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return NextResponse.json({ dry: true, subject, to: DIGEST_TO, metrics });
  }

  if (!alertConfigured()) {
    return NextResponse.json({ skipped: "RESEND_API_KEY not set", subject }, { status: 200 });
  }

  const sent = await sendAdminAlert({ subject, html, to: DIGEST_TO });
  return NextResponse.json({ sent: sent?.id ?? null, subject, to: DIGEST_TO });
}

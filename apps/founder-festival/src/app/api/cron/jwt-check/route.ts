import { NextResponse } from "next/server";
import { getTokenExpiry } from "@/lib/nfx-token";
import { getNfxToken } from "@/lib/nfx-token-store";
import { sendAdminAlert, alertConfigured } from "@/lib/admin-alert";

// One-click refresh page (no DevTools) — linked in the alert email.
const REFRESH_PAGE = "https://festival.so/admin/nfx-refresh";

export const maxDuration = 60;

// Warn ~2 weeks before the NFX Signal JWT lapses, so we can refresh it from a
// logged-in signal.nfx.com session before the scraper silently breaks.
const WARN_WITHIN_DAYS = 14;

// Weekly cron (see vercel.json). Auth matches the other cron routes:
// Authorization: Bearer <CRON_SECRET>. `?force=1` sends a test email regardless
// of expiry (handy to verify Resend end-to-end).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const force = new URL(req.url).searchParams.get("force") === "1";
  // Check the LIVE token (DB-first, env seed fallback) — same source the enricher uses.
  const info = getTokenExpiry(await getNfxToken());

  if (!info) {
    // Token missing or unreadable — that itself is worth flagging.
    const html =
      `<p>The <strong>NFX Signal token</strong> is missing or not a readable JWT. The NFX scraper will not authenticate.</p>` +
      `<p><a href="${REFRESH_PAGE}">Open the one-click refresh page →</a> (log into signal.nfx.com, click the bookmark).</p>`;
    const sent = await sendAdminAlert({ subject: "⚠️ NFX token missing / unreadable", html });
    return NextResponse.json({ ok: true, status: "unreadable", alerted: !!sent });
  }

  const shouldAlert = force || info.expired || info.daysLeft <= WARN_WITHIN_DAYS;
  let alerted = false;
  if (shouldAlert) {
    const when = info.expiresAt.slice(0, 10);
    const lead = info.expired
      ? `has <strong>EXPIRED</strong> (was ${when})`
      : `expires in <strong>${Math.floor(info.daysLeft)} days</strong> (on ${when})`;
    const html =
      `<p>Your <strong>NFX Signal token</strong> ${lead}.</p>` +
      `<p><strong><a href="${REFRESH_PAGE}">Open the one-click refresh page →</a></strong></p>` +
      `<p style="color:#555;font-size:13px">Log into <a href="https://signal.nfx.com">signal.nfx.com</a> (associate account), then click your <em>🔄 Refresh NFX token</em> bookmark. No DevTools needed. (First time? The page has a button to drag to your bookmarks bar.)</p>` +
      (force ? `<p style="color:#999;font-size:12px">(This is a forced test email.)</p>` : "");
    const sent = await sendAdminAlert({ subject: `NFX token: ${info.expired ? "EXPIRED" : `expires in ${Math.floor(info.daysLeft)}d`}`, html });
    alerted = !!sent;
  }

  return NextResponse.json({
    ok: true,
    expiresAt: info.expiresAt,
    daysLeft: Math.round(info.daysLeft * 10) / 10,
    expired: info.expired,
    warnWithinDays: WARN_WITHIN_DAYS,
    alerted,
    alertConfigured: alertConfigured(),
  });
}

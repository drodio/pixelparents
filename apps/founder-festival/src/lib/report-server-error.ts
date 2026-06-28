// Centralized "tell me when a route failed" helper. Covers the gap where a
// route handler CATCHES an error (returning 4xx/5xx) and so the error never
// bubbles to Next's onRequestError → PostHog wiring in instrumentation.ts.
//
// Three side-effects per call:
//   1. console.error so it lands in Vercel runtime logs.
//   2. posthog.captureException so the error is visible in the PostHog
//      Errors view + searchable / aggregatable / chartable.
//   3. sendAdminAlert email to drodio@festival.so AND sendAdminSms text to
//      ADMIN_ALERT_PHONE — both DEDUPED in-memory by error fingerprint, max
//      once per hour per fingerprint, so a stuck button or rate-limit storm
//      doesn't email- or text-bomb the operator. Email and SMS each fire only
//      when their own transport is configured (RESEND_API_KEY for email; the
//      Twilio creds + numbers for SMS), so prod gets both while local/preview
//      (no keys / test creds) stay quiet.
//
// The dedupe map is per-instance (serverless cold starts reset it). That's
// acceptable: worst case you get a fresh alert after a cold start. If you
// later want stronger dedupe, swap the Map for a small Postgres table keyed
// by fingerprint + last_sent_at.

import { getPostHogServer } from "./posthog-server";
import { alertConfigured, sendAdminAlert } from "./admin-alert";
import { smsConfigured, sendAdminSms } from "./sms";

const ALERT_DEDUPE_MS = 60 * 60 * 1000;
const lastAlertAt = new Map<string, number>();

function fingerprint(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}:${err.message}`.slice(0, 200);
  }
  return String(err).slice(0, 200);
}

function shouldAlert(fp: string): boolean {
  const now = Date.now();
  const last = lastAlertAt.get(fp);
  if (last && now - last < ALERT_DEDUPE_MS) return false;
  lastAlertAt.set(fp, now);
  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}

export type ServerErrorContext = {
  route: string;
} & Record<string, unknown>;

export async function reportServerError(
  err: unknown,
  context: ServerErrorContext,
): Promise<void> {
  console.error(`[${context.route}]`, err);

  // PostHog. Safe no-op when NEXT_PUBLIC_POSTHOG_KEY isn't set (e.g. local
  // dev without PostHog wired up).
  const posthog = getPostHogServer();
  if (posthog && err instanceof Error) {
    try {
      posthog.captureException(err, undefined, context);
    } catch (phErr) {
      console.error("[report-server-error] posthog capture failed:", phErr);
    }
  }

  // Operator alerts: email + SMS. Each channel is independent — it fires only
  // if its own transport is configured (RESEND_API_KEY for email; Twilio creds
  // + numbers for SMS). Locally, neither is configured so dev runs just log +
  // capture; prod sends both. Both share ONE dedup gate so a storm can't spam.
  const emailOn = alertConfigured();
  const smsOn = smsConfigured();
  if (!emailOn && !smsOn) return;
  const fp = fingerprint(err);
  if (!shouldAlert(fp)) return;

  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack ?? "" : "";

  // SMS: one short line — error name + truncated message + route, so the most
  // useful "what + where" fits in a glanceable text. Route is appended after
  // the truncation so it's never dropped on a long message.
  if (smsOn) {
    const errName = err instanceof Error ? err.name : "Error";
    const shortMsg = msg.length > 100 ? `${msg.slice(0, 99)}…` : msg;
    try {
      await sendAdminSms(`🔴 festival prod: ${errName}: ${shortMsg} — ${context.route}`);
    } catch (smsErr) {
      console.error("[report-server-error] sendAdminSms failed:", smsErr);
    }
  }

  if (!emailOn) return;
  const ctxRows = Object.entries(context)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:2px 8px;color:#888;">${escapeHtml(k)}</td><td style="padding:2px 8px;font-family:monospace;">${escapeHtml(
          typeof v === "string" ? v : JSON.stringify(v),
        )}</td></tr>`,
    )
    .join("");

  try {
    await sendAdminAlert({
      subject: `[Festival] Server error in ${context.route}`,
      html: [
        `<p><strong>Route:</strong> ${escapeHtml(context.route)}</p>`,
        `<p><strong>Error:</strong> ${escapeHtml(msg)}</p>`,
        `<table style="border-collapse:collapse;font-size:13px;">${ctxRows}</table>`,
        `<pre style="font-family:monospace;font-size:12px;white-space:pre-wrap;background:#f8f8f8;padding:8px;border-radius:4px;">${escapeHtml(stack)}</pre>`,
        `<hr>`,
        `<p style="font-size:11px;color:#888;">Dedupe window: 1 hour per error fingerprint. To see all occurrences, check PostHog.</p>`,
      ].join("\n"),
    });
  } catch (alertErr) {
    console.error("[report-server-error] sendAdminAlert failed:", alertErr);
  }
}

"use server";

import { headers } from "next/headers";
import { Resend } from "resend";
import { getAdminRecipients } from "@/lib/admin";
import { createReport } from "@/lib/db/reports";

// --- Report a bug or abuse / contact form.
//
// `hello@gopixel.org` is NOT a real mailbox, so this no longer emails a dead
// address. Reports are PERSISTED to the `reports` DB table (the source of truth)
// and triaged from /admin/reports. As a best-effort courtesy we also email the
// REAL admins (env superadmins + the `admins` table, via getAdminRecipients) that
// a new report arrived — but we never send to hello@gopixel.org. All config
// is env-driven (PUBLIC repo — no personal contact hardcoded).

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

// Same FROM fallback as lib/email.ts (use `||` so a blank value still yields a
// valid sender — a blank "from" makes Resend reject every send).
const FROM = process.env.RESEND_FROM?.trim() || "GoPixel <noreply@gopixel.org>";

// Absolute base URL for the admin link in the notification email (best-effort).
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://gopixel.org")
  .trim()
  .replace(/\/$/, "");

const CATEGORIES = ["bug", "abuse", "other"] as const;
type Category = (typeof CATEGORIES)[number];

const MAX_MESSAGE = 4000;
const MAX_EMAIL = 254;

export type ReportState = { ok: boolean; error?: string };

// --- Lightweight per-IP rate limit (best-effort, in-memory) -------------------
// Caps reports to RATE_MAX per RATE_WINDOW_MS per client. In-memory means it's
// per-instance only (not a hard guarantee across serverless instances), but it
// cheaply stops a single client from hammering the form. Good enough for a
// low-volume report endpoint; a durable limiter is a later wave.
const RATE_MAX = 3;
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (hits.size > 5000) {
    for (const [k, ts] of hits) {
      if (ts.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

function isCategory(v: string): v is Category {
  return (CATEGORIES as readonly string[]).includes(v);
}

// Very loose email sanity check — optional field, only validated when present.
function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

const LABELS: Record<Category, string> = {
  bug: "Bug",
  abuse: "Abuse",
  other: "Other",
};

// Best-effort fan-out to real admins that a new report landed. Never throws into
// the request path, and never targets hello@gopixel.org — the DB row is the
// source of truth; this is just a nudge to go look at /admin/reports.
async function notifyAdmins(category: Category, contact: string, message: string): Promise<void> {
  if (!resend) return;
  let recipients: string[] = [];
  try {
    recipients = (await getAdminRecipients()).map((r) => r.email).filter(Boolean);
  } catch (err) {
    console.error("submitReport: admin lookup failed:", err);
    return;
  }
  if (recipients.length === 0) return;

  const text = [
    `A new GoPixel report was submitted.`,
    ``,
    `Category: ${LABELS[category]}`,
    `Contact:  ${contact || "(not provided)"}`,
    ``,
    `Message:`,
    message,
    ``,
    `Triage it here: ${APP_URL}/admin/reports`,
  ].join("\n");

  try {
    await resend.emails.send({
      from: FROM,
      to: recipients,
      replyTo: contact && looksLikeEmail(contact) ? contact : undefined,
      subject: `GoPixel report: ${LABELS[category]}`,
      text,
    });
  } catch (err) {
    console.error("submitReport: admin notification failed:", err);
  }
}

export async function submitReport(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const category = String(formData.get("category") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();

  if (!isCategory(category)) {
    return { ok: false, error: "Please pick a category." };
  }
  if (message.length < 5) {
    return { ok: false, error: "Please add a short description so we can help." };
  }
  if (message.length > MAX_MESSAGE) {
    return { ok: false, error: "That message is a bit long — please trim it." };
  }
  if (contact && (contact.length > MAX_EMAIL || !looksLikeEmail(contact))) {
    return { ok: false, error: "That email address doesn't look right." };
  }

  // Rate-limit by client IP (best-effort; proxies set x-forwarded-for).
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown";
  if (rateLimited(ip)) {
    return {
      ok: false,
      error: "You've sent a few reports already — please try again in a little while.",
    };
  }

  const sourcePath = h.get("referer") || null;

  // Persist to the DB — this is the source of truth admins triage.
  try {
    await createReport({
      category,
      message,
      contactEmail: contact || null,
      sourcePath,
      requestIp: ip === "unknown" ? null : ip,
    });
  } catch (err) {
    console.error("submitReport: createReport failed:", err);
    return { ok: false, error: "Something went wrong saving your report. Please try again." };
  }

  // Best-effort: nudge real admins to go triage. Failures here don't fail the
  // submission — the report is already safely stored.
  await notifyAdmins(category, contact, message);

  return { ok: true };
}

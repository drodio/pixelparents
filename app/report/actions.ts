"use server";

import { headers } from "next/headers";
import { Resend } from "resend";

// --- Report a bug or abuse: emails the admin via the same Resend setup the rest
// of the app uses (RESEND_API_KEY / RESEND_FROM). No new DB table — a full
// report → admin queue is a later Trust & Safety wave; email-to-admin is enough
// now. All config is env-driven (PUBLIC repo — no personal contact hardcoded).

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

// Same FROM fallback as lib/email.ts (use `||` so a blank value still yields a
// valid sender — a blank "from" makes Resend reject every send).
const FROM = process.env.RESEND_FROM?.trim() || "Pixel Parents <noreply@pixelparents.org>";

// Where reports go. Prefer a dedicated REPORT_TO, fall back to the shared
// NOTIFY_TO admin inbox, then the project's own address as a safe default.
// No personal email is ever committed here.
const REPORT_TO =
  process.env.REPORT_TO?.trim() ||
  process.env.NOTIFY_TO?.trim() ||
  "hello@pixelparents.org";

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

  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping report email.");
    // Don't expose config issues to the reporter; just thank them.
    return { ok: true };
  }

  const labels: Record<Category, string> = {
    bug: "Bug",
    abuse: "Abuse",
    other: "Other",
  };
  const text = [
    `A new Pixel Parents report was submitted.`,
    ``,
    `Category: ${labels[category]}`,
    `Contact:  ${contact || "(not provided)"}`,
    ``,
    `Message:`,
    message,
  ].join("\n");

  try {
    await resend.emails.send({
      from: FROM,
      to: REPORT_TO,
      // Let admins reply straight to the reporter when they left an email.
      replyTo: contact && looksLikeEmail(contact) ? contact : undefined,
      subject: `Pixel Parents report: ${labels[category]}`,
      text,
    });
    return { ok: true };
  } catch (err) {
    console.error("submitReport: Resend send failed:", err);
    return { ok: false, error: "Something went wrong sending your report. Please try again." };
  }
}

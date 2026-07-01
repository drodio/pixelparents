"use server";

import { after } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { primaryEmail } from "@/lib/clerk";
import { isAdminEmail, getAdminRecipients } from "@/lib/admin";
import { getFamilyForEmail, getSignupByEmail } from "@/lib/db/signups";
import { verifiedEmailsOf } from "@/lib/verify";
import {
  createFeedback,
  sanitizeFeedbackMessage,
  MAX_FEEDBACK_MESSAGE,
} from "@/lib/db/feedback";

// --- In-app feedback submit action.
//
// Backs the always-reachable "Send feedback" widget (sidebar + help menu). The
// author is resolved ENTIRELY server-side from the Clerk session — a client can
// never spoof another identity. We require a signed-in, VERIFIED family (any
// verified OHS student in the family, mirroring the community/directory gate;
// admins are always allowed) so feedback comes from real members, then persist
// to the `feedback` table (the source of truth admins triage at /admin/feedback).
//
// PUBLIC repo: no personal contact is ever hardcoded; the best-effort admin
// email notification is env-driven (Resend + getAdminRecipients).

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;
const FROM = process.env.RESEND_FROM?.trim() || "Pixel Parents <noreply@pixelparents.org>";
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://pixelparents.org")
  .trim()
  .replace(/\/$/, "");

export type FeedbackResult = { ok: boolean; error?: string };

// Only accept in-app paths ("/…") for page_path — never a full URL or junk. Keeps
// the stored value clean and avoids logging an off-site referer.
function cleanPagePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v.startsWith("/") || v.length > 512) return null;
  return v;
}

// Best-effort nudge to real admins that new feedback landed. Never throws into
// the request path; runs in after() so it never delays the user's confirmation.
async function notifyAdmins(pagePath: string | null, message: string): Promise<void> {
  if (!resend) return;
  let recipients: string[] = [];
  try {
    recipients = (await getAdminRecipients()).map((r) => r.email).filter(Boolean);
  } catch (err) {
    console.error("submitFeedbackAction: admin lookup failed:", err);
    return;
  }
  if (recipients.length === 0) return;

  const text = [
    "New in-app feedback was submitted.",
    "",
    `From page: ${pagePath ?? "(unknown)"}`,
    "",
    "Message:",
    message,
    "",
    `Triage it here: ${APP_URL}/admin/feedback`,
  ].join("\n");

  try {
    await resend.emails.send({
      from: FROM,
      to: recipients,
      subject: "Pixel Parents feedback",
      text,
    });
  } catch (err) {
    console.error("submitFeedbackAction: admin notification failed:", err);
  }
}

export async function submitFeedbackAction(input: {
  message: string;
  pagePath?: string | null;
}): Promise<FeedbackResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Please sign in to send feedback." };

  const email = primaryEmail(user);
  if (!email) return { ok: false, error: "Please sign in to send feedback." };

  const message = sanitizeFeedbackMessage(input?.message ?? "");
  if (message.length < 3) {
    return { ok: false, error: "Please add a little more so we can act on it." };
  }
  // sanitizeFeedbackMessage already clamps to MAX_FEEDBACK_MESSAGE; a message that
  // arrived longer than the raw cap means the client bypassed the field limit —
  // clamp is already applied, so nothing further to do. (Guard kept for clarity.)
  if (input.message && input.message.length > MAX_FEEDBACK_MESSAGE * 4) {
    return { ok: false, error: "That message is a bit long — please trim it." };
  }

  // Verified gate: admins always pass; otherwise the caller's family must carry at
  // least one verified OHS student (same union-across-family rule the layout gate
  // and community surface use). Best-effort — a lookup failure falls through to
  // "not verified" rather than throwing.
  let allowed = false;
  let signupId: string | null = null;
  try {
    if (await isAdminEmail(email)) {
      allowed = true;
    }
    const [signup, family] = await Promise.all([
      getSignupByEmail(email),
      getFamilyForEmail(email),
    ]);
    signupId = signup?.id ?? null;
    if (!allowed && family) {
      allowed = family.members.some(
        (m) => verifiedEmailsOf((m.extra ?? {}) as Record<string, unknown>).length > 0,
      );
    }
  } catch (err) {
    console.error("submitFeedbackAction: verification lookup failed:", err);
  }

  if (!allowed) {
    return {
      ok: false,
      error: "Verify your OHS student to send feedback — it only takes a minute.",
    };
  }

  const pagePath = cleanPagePath(input.pagePath);

  try {
    await createFeedback({
      message,
      authorSignupId: signupId,
      authorClerkId: user.id,
      pagePath,
    });
  } catch (err) {
    console.error("submitFeedbackAction: createFeedback failed:", err);
    return { ok: false, error: "Something went wrong sending your feedback. Please try again." };
  }

  // Nudge admins after the response is sent — never blocks the confirmation.
  after(() => notifyAdmins(pagePath, message));

  return { ok: true };
}

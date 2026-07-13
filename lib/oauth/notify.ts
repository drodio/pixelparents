import { Resend } from "resend";
import { getBaseUrl } from "@/lib/url";

// Admin notification for newly registered "Sign in with GoPixel" apps.
//
// Lives here (not lib/email.ts) because it belongs to the OIDC feature, and is
// env-driven exactly like the rest of the mail path: PUBLIC repo, so no personal
// contact info is hardcoded. Set RESEND_API_KEY + RESEND_FROM + NOTIFY_TO in env.
//
// Best-effort by design: registration must never fail or block because email is
// unconfigured or Resend is down. Every path swallows errors and returns void.

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;
const FROM = process.env.RESEND_FROM?.trim() || "GoPixel <noreply@gopixel.org>";
const TO = process.env.NOTIFY_TO ?? "";

// Notify DROdio that a new Sign-in app was registered. The `minorData` flag marks
// apps requesting scopes about OHS students (ohs_verified / role / grade_band) —
// the ones the UI promises get "extra review", so they get a louder subject and a
// prompt to actually look before the app is trusted (either via the per-client
// approve/reject lever, or the owner's API-access approval).
export async function notifyAdminNewOAuthApp(notice: {
  name: string;
  scopes: string[];
  minorData: boolean;
  ownerId: string | null;
}): Promise<void> {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping OAuth app admin notification");
    return;
  }
  if (!TO.trim()) {
    console.warn("NOTIFY_TO unset — skipping OAuth app admin notification");
    return;
  }
  const base = getBaseUrl();
  const text = [
    notice.minorData
      ? `A new "Sign in with GoPixel" app requesting MINOR data was just registered.`
      : `A new "Sign in with GoPixel" app was just registered.`,
    ``,
    `App name: ${notice.name}`,
    `Scopes:   ${notice.scopes.join(", ") || "—"}`,
    `Owner:    ${notice.ownerId ?? "—"}`,
    ``,
    notice.minorData
      ? `This app requests scopes about OHS students — please review it before it's trusted.`
      : `No minor-data scopes were requested.`,
    ``,
    `Review Sign-in apps at ${base}/admin/oauth-apps`,
  ].join("\n");
  try {
    await resend.emails.send({
      from: FROM,
      to: TO,
      subject: notice.minorData
        ? `Review needed — new minor-data Sign-in app: ${notice.name}`
        : `New Sign-in app registered: ${notice.name}`,
      text,
    });
  } catch (err) {
    console.error("notifyAdminNewOAuthApp send failed:", err);
  }
}

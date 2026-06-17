import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

// All config is env-driven — this repo is PUBLIC, so no personal contact info
// (sender name, notify address, phone, signature) is hardcoded here.
// Set RESEND_FROM, NOTIFY_TO, and EMAIL_SIGNATURE (multi-line) in env.
const FROM = process.env.RESEND_FROM ?? "Pixel Parents <noreply@pixelparents.org>";
const TO = process.env.NOTIFY_TO ?? "";
const SIGNATURE = process.env.EMAIL_SIGNATURE ?? "";

// A primary `to` is required for a send. `cc` is supplementary (e.g. cc'ing an
// applicant on an admin notification) and never promotes to the primary
// recipient — so an admin email with no NOTIFY_TO is skipped, not mis-sent.
export function hasRecipient(to?: string | string[]): boolean {
  if (Array.isArray(to)) return to.some((t) => Boolean(t && t.trim()));
  return Boolean(to && to.trim());
}

// Appends the signature only when one is configured (EMAIL_SIGNATURE in env).
export function appendSignature(text: string, signature: string): string {
  return signature ? `${text}\n\n${signature}` : text;
}

// Single send path: applies FROM + the (optional) signature, best-effort (never
// throws, never blocks the caller). Returns false when email is unconfigured/failed.
async function sendEmail(msg: {
  to: string | string[];
  subject: string;
  text: string;
  cc?: string[];
}): Promise<boolean> {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping email:", msg.subject);
    return false;
  }
  if (!hasRecipient(msg.to)) {
    console.warn("No recipient (NOTIFY_TO unset?) — skipping email:", msg.subject);
    return false;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to: msg.to,
      cc: msg.cc,
      subject: msg.subject,
      text: appendSignature(msg.text, SIGNATURE),
    });
    return true;
  } catch (err) {
    console.error("Resend send failed:", msg.subject, err);
    return false;
  }
}

const ACCOUNT_URL = "https://pixelparents.org/account";

export type SignupNotification = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  githubUsername: string;
  ohsAffiliation?: string | null;
  technicalDepth?: string | null;
  linkedinUrl?: string | null;
  skillsets?: string[] | null;
  timeCommitment?: string | null;
};

// Best-effort: never throws, never blocks the user's signup.
export async function notifyNewSignup(s: SignupNotification): Promise<void> {
  const text = [
    `New Pixel Parents signup`,
    ``,
    `Name:        ${s.firstName} ${s.lastName}`,
    `Email:       ${s.email}`,
    `Phone:       ${s.phone}`,
    `GitHub:      ${s.githubUsername}`,
    `Affiliation: ${s.ohsAffiliation || "—"}`,
    `Tech depth:  ${s.technicalDepth || "—"}`,
    `LinkedIn:    ${s.linkedinUrl || "—"}`,
    `Skillsets:   ${s.skillsets?.length ? s.skillsets.join(", ") : "—"}`,
    `Time/week:   ${s.timeCommitment || "—"}`,
    ``,
    `Signup id:   ${s.id}`,
  ].join("\n");
  await sendEmail({
    to: TO,
    cc: s.email ? [s.email] : undefined,
    subject: `New Pixel Parents signup: ${s.firstName} ${s.lastName}`,
    text,
  });
}

// --- Developer API: notify DROdio of a new access request (no key yet) ---
export async function notifyAdminNewApiRequest(notice: {
  name: string;
  email: string;
  intendedUse: string;
}): Promise<void> {
  const text = [
    `A new Pixel Parents developer API access request is awaiting review.`,
    ``,
    `Name:         ${notice.name}`,
    `Email:        ${notice.email}`,
    `Intended use: ${notice.intendedUse}`,
    ``,
    `Approve or reject at https://pixelparents.org/admin/api-requests`,
  ].join("\n");
  await sendEmail({ to: TO, subject: `New API access request: ${notice.name}`, text });
}

// --- Developer API: confirm to the applicant that we received their request ---
export async function notifyApiRequestReceived(notice: {
  to: string;
  name: string;
}): Promise<void> {
  const text = [
    `Hi ${notice.name},`,
    ``,
    `Thanks for requesting Pixel Parents developer API access — your request is`,
    `under review. We review every request by hand, and you'll get another email`,
    `when it's approved. Your API key will then show up at:`,
    ``,
    ACCOUNT_URL,
  ].join("\n");
  await sendEmail({
    to: notice.to,
    subject: "Your Pixel Parents API request is under review ⏳",
    text,
  });
}

// --- Developer API: tell an applicant their request was approved/rejected ---
export async function notifyApiDecision(notice: {
  to: string;
  name: string;
  approved: boolean;
  reason?: string | null;
}): Promise<void> {
  const subject = notice.approved
    ? "Your Pixel Parents API access is approved 🎉"
    : "Your Pixel Parents API access request";
  const text = notice.approved
    ? [
        `Hi ${notice.name},`,
        ``,
        `Good news — your Pixel Parents developer API access has been approved.`,
        `Sign in and grab your API key here:`,
        ``,
        ACCOUNT_URL,
        ``,
        `Have fun building (or vibe coding!) something for the OHS community.`,
      ].join("\n")
    : [
        `Hi ${notice.name},`,
        ``,
        `Thanks for your interest in the Pixel Parents developer API.`,
        `Unfortunately we can't approve this request right now.`,
        notice.reason ? `\nNote: ${notice.reason}` : ``,
        ``,
        `If you think this was a mistake, just reply to this email.`,
      ].join("\n");
  await sendEmail({ to: notice.to, subject, text });
}

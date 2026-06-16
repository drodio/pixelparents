import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const FROM = process.env.RESEND_FROM ?? "Pixel Parents <onboarding@resend.dev>";
const TO = process.env.NOTIFY_TO ?? "DROdio@chief.bot";

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
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping signup notification email.");
    return;
  }
  const lines = [
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
  ];
  try {
    await resend.emails.send({
      from: FROM,
      to: TO,
      cc: s.email ? [s.email] : undefined,
      subject: `New Pixel Parents signup: ${s.firstName} ${s.lastName}`,
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("Resend notification failed:", err);
  }
}

const ACCOUNT_URL = "https://pixelparents.org/account";

// --- Developer API: notify DROdio of a new access request (no key yet) ---
// Best-effort: never throws, never blocks the request.
export async function notifyAdminNewApiRequest(notice: {
  name: string;
  email: string;
  intendedUse: string;
}): Promise<void> {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping API-request admin email.");
    return;
  }
  const text = [
    `A new Pixel Parents developer API access request is awaiting review.`,
    ``,
    `Name:         ${notice.name}`,
    `Email:        ${notice.email}`,
    `Intended use: ${notice.intendedUse}`,
    ``,
    `Approve or reject at https://pixelparents.org/admin/api-requests`,
  ].join("\n");
  try {
    await resend.emails.send({
      from: FROM,
      to: TO,
      subject: `New API access request: ${notice.name}`,
      text,
    });
  } catch (err) {
    console.error("Resend API-request notification failed:", err);
  }
}

// --- Developer API: tell an applicant their request was approved/rejected ---
// Best-effort: never throws, never blocks the admin's decision.
export async function notifyApiDecision(notice: {
  to: string;
  name: string;
  approved: boolean;
  reason?: string | null;
}): Promise<void> {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping API decision email.");
    return;
  }
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
  try {
    await resend.emails.send({ from: FROM, to: notice.to, subject, text });
  } catch (err) {
    console.error("Resend API decision notification failed:", err);
  }
}

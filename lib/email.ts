import { Resend } from "resend";
import { getBaseUrl } from "@/lib/url";

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
  // Optional From override (defaults to RESEND_FROM). Used for the admin
  // verification email, which goes from the hello@ address.
  from?: string;
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
      from: msg.from ?? FROM,
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

// From address for the admin "verify this profile" email. Env-overridable but
// defaults to the project's own hello@ address (PUBLIC repo — no personal info).
const VERIFY_FROM = process.env.RESEND_VERIFY_FROM ?? "Pixel Parents <hello@pixelparents.org>";

// Notify every admin that a new parent needs their OHS-directory access verified.
// One personalized email per admin; whoever acts first resolves it for everyone
// (see recordApprovalDecision). Best-effort: never throws, never blocks signup.
export async function notifyAdminsVerifyProfile(n: {
  applicant: { id: string; firstName: string; lastName: string };
  admins: { email: string; firstName: string }[];
}): Promise<void> {
  const base = getBaseUrl();
  const name = `${n.applicant.firstName} ${n.applicant.lastName}`.trim();
  const profileUrl = `${base}/admin/verify/${n.applicant.id}`;
  const approveUrl = `${profileUrl}?action=approve`;
  const denyUrl = `${profileUrl}?action=deny`;
  for (const admin of n.admins) {
    const hi = admin.firstName ? admin.firstName : "there";
    const text = [
      `${hi},`,
      ``,
      `You are getting this email because you are an admin on Pixel Parents.`,
      ``,
      `${name} has requested access to the OHS parent directory. Approve?`,
      ``,
      `- View their profile: ${profileUrl}`,
      `- Approve them: ${approveUrl}`,
      `- Deny them: ${denyUrl}`,
      ``,
      `The first admin who acts on this will take care of it for everyone.`,
    ].join("\n");
    await sendEmail({
      to: admin.email,
      from: VERIFY_FROM,
      subject: `Verify ${name}'s profile on Pixel Parents`,
      text,
    });
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
  // No applicant CC here — they now get the curated notifyApplicantWelcome email
  // instead of this internal-style admin dump.
  await sendEmail({
    to: TO,
    subject: `New Pixel Parents signup: ${s.firstName} ${s.lastName}`,
    text,
  });
}

// Welcome the applicant after step 1 and point them at step 2 (their thanks page).
// The signature (EMAIL_SIGNATURE) is auto-appended and provides the contact line.
export async function notifyApplicantWelcome(n: {
  to: string;
  firstName: string;
  id: string;
}): Promise<void> {
  const base = getBaseUrl();
  const exampleUrl = process.env.NEXT_PUBLIC_DRODIO_SUBMISSION_URL;
  const text = [
    `Hi ${n.firstName},`,
    ``,
    `Thanks for signing up for Pixel Parents — I've got your submission, and I'm glad you're here. Looking forward to connecting with you more over WhatsApp.`,
    ``,
    `There's one more (optional) step whenever you have a few minutes: if you're willing to tell us a bit about your interests and your child(ren) at OHS, it helps us build a small seed data set before we bring other parents in:`,
    ``,
    `\u{1F449} ${base}/signup/thanks?id=${n.id}`,
    ``,
    `That link is yours — you can come back to it anytime, and as a parent you keep full control over your data. Only you + Pixel Parent admins (like our builder group) will have access to your answers.`,
    ``,
    `You will also be able to create a "secret link" to share your answers. You can restrict who can open it to only OHS parents (others who've signed up in our system), or keep it private to just you.`,
    ...(exampleUrl
      ? [
          ``,
          `For example, here's my "secret link" family profile page so you can get to know me and my family:`,
          ``,
          exampleUrl,
        ]
      : []),
    ``,
    `A bit about me and what I'm hoping we build together: I'm dad to Devina, just entering OHS as a 7th grader, and CEO of Chief https://Chief.bot, an AI Chief of Staff startup in the SF Bay area. My goal with Pixel Parents is to build software that transforms the experience of parents and students at OHS — staying independent, moving fast, and keeping everything open source so others can benefit too.`,
  ].join("\n");
  await sendEmail({
    to: n.to,
    subject: "Thanks for signing up for Pixel Parents — one more step",
    text,
  });
}

// Invite a co-parent (spouse / other parent) to join an existing family. The
// join link is tied to the family's invite token; opening it lets them create
// their own parent row attached to the same family + shared children.
// Returns whether the send succeeded (the caller tallies how many went out).
export async function notifyCoParentInvite(n: {
  to: string;
  inviterName: string;
  joinUrl: string;
}): Promise<boolean> {
  const who = n.inviterName || "Your co-parent";
  const text = [
    `Hi,`,
    ``,
    `${who} invited you to join their family on Pixel Parents — OHS parents`,
    `building software to make our kids' educational experience better.`,
    ``,
    `Use your private link below to fill out your own information. You'll be able`,
    `to view and edit your family and children information together:`,
    ``,
    `\u{1F449} ${n.joinUrl}`,
    ``,
    `That link is yours — you can come back to it anytime. Your name, email, and`,
    `contact details stay your own; the children you and ${who} add are shared`,
    `across your family.`,
  ].join("\n");
  return sendEmail({
    to: n.to,
    subject: `${who} invited you to Pixel Parents`,
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

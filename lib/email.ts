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

// --- Developer API: notify DROdio of a self-serve API-key request ---
// Uses the Resend REST API directly so it stays dependency-light. Best-effort:
// absence of RESEND_API_KEY or any failure is swallowed.
export type KeyRequestNotice = {
  name: string;
  email: string;
  intendedUse: string;
  prefix: string;
};

export async function notifyKeyRequest(notice: KeyRequestNotice): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const to = process.env.NOTIFY_TO ?? "DROdio@chief.bot";
  const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";
  const text = [
    `A new Pixel Parents API key was just issued (tier: public).`,
    ``,
    `Name:         ${notice.name}`,
    `Email:        ${notice.email}`,
    `Key prefix:   ${notice.prefix}`,
    `Intended use: ${notice.intendedUse}`,
    ``,
    `Approve in /admin to unlock the 'approved' (non-PII detail) tier.`,
  ].join("\n");
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `New Pixel Parents API key request: ${notice.name}`,
        text,
      }),
    });
  } catch {
    // ignore — notification is non-critical and must not block issuance
  }
}

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
      subject: `New Pixel Parents signup: ${s.firstName} ${s.lastName}`,
      text: lines.join("\n"),
    });
  } catch (err) {
    console.error("Resend notification failed:", err);
  }
}

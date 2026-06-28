import { sendRawEmail } from "./email";

// Emails for the Claim Review Console (owner-proposed profile edits). From
// hello@festival.so. All person-supplied values are HTML-escaped.

const FROM = process.env.RESEND_FROM ?? "Founder Festival <hello@festival.so>";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// "Your profile edit was approved" — sent when an admin approves an owner's
// proposed edit. Shows the new claim, the original (struck through), and the
// score change. Best-effort caller; throws on Resend error.
export async function sendClaimApprovalEmail(opts: {
  to: string;
  firstName: string;
  profileUrl: string;
  originalScore: number;
  newScore: number;
  newClaim: string;
  originalClaim: string | null;
}): Promise<void> {
  const { to, firstName, profileUrl, originalScore, newScore, newClaim, originalClaim } = opts;
  const url = esc(profileUrl);
  const html = `
    <p>${esc(firstName)}, You had proposed the following edit on your profile, which has been approved
    and is now reflected on <a href="${url}">${url}</a>. We have also rerun your score, which has changed
    from <strong>${originalScore}</strong> to <strong>${newScore}</strong>.</p>
    <p>${esc(newClaim)}<br/>
    ${originalClaim ? `<s style="color:#888888;">${esc(originalClaim)}</s>` : ""}</p>
    <p>You can hit reply if you've got any other comments, questions, or feedback.</p>
  `;
  await sendRawEmail({ from: FROM, to, subject: "Your profile edit was approved", html });
}

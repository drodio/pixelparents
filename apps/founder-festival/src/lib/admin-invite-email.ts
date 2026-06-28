// Composes + sends the admin-invite email. Body matches the user's spec
// exactly so the recipient knows what to expect when they click the link.

import { sendRawEmail } from "./email";

const FROM = "DROdio <drodio@festival.so>";
const BOOKING_URL = "http://go.drod.io/book-me";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderAdminInviteEmail(opts: {
  acceptUrl: string;
  inviterName: string;
}): { subject: string; html: string } {
  const inviter = escapeHtml(opts.inviterName);
  const url = escapeHtml(opts.acceptUrl);
  const subject = `${inviter} has invited you to be a Festival admin`;
  // Plain copy, exactly as the user requested. Inviter name + Festival.so
  // links + booking link. No marketing, no signature beyond DROdio.
  const html = [
    `<p>I just invited you to be an admin on <a href="https://festival.so">https://festival.so</a></p>`,
    `<p>To accept this invitation, click this secret link: <a href="${url}">${url}</a></p>`,
    `<p>And you can book an onboarding slot with me at <a href="${BOOKING_URL}">${BOOKING_URL}</a></p>`,
    `<p>${inviter}</p>`,
  ].join("\n");
  return { subject, html };
}

export async function sendAdminInviteEmail(opts: {
  to: string;
  acceptUrl: string;
  inviterName: string;
}): Promise<{ id: string }> {
  const { subject, html } = renderAdminInviteEmail({
    acceptUrl: opts.acceptUrl,
    inviterName: opts.inviterName,
  });
  return sendRawEmail({ from: FROM, to: opts.to, subject, html });
}

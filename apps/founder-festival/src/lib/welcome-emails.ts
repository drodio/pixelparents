// Lifecycle welcome-email templates (claim + dev-API). Pure renderers return
// { subject, html } and are fully unit-tested; thin send wrappers go through the
// shared Resend client in ./email. First names are Clerk-controlled → escaped.

import { sendRawEmail } from "@/lib/email";

export const FROM_DRODIO = "DROdio <drodio@festival.so>";
export const WELCOME_CC = "founder@festival.so";

const MY_PROFILE_URL = "https://festival.so/profile/founder/daniel-r-odio";
const CHIEF_URL = "https://chief.bot";
const DEVELOPERS_URL = "https://festival.so/developers";

const MY_PROFILE_LINK = `<a href="${MY_PROFILE_URL}">my profile</a>`;
const CHIEF_LINK = `<a href="${CHIEF_URL}">Chief</a>`;
const FESTIVAL_API_LINK = `<a href="${DEVELOPERS_URL}">Festival API</a>`;

const INTRO_HTML = `<p>Festival it's a side project I created as a founder myself. (Here's ${MY_PROFILE_LINK}). My day job is CEO of ${CHIEF_LINK}.</p>`;
const FESTIVAL_FEEDBACK_HTML = `<p>I'd love to get your feedback on Festival. What did you like; learn; long-for? What's the next feature I should build into it?</p>`;
// Closing sign-off is now appended centrally to every email (the editable
// "Email options" signature), so the templates no longer carry their own.
const SIGNOFF_HTML = ``;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Priority: claimer's chosen nickname > Clerk firstName > fallback full name >
// "there". Nickname is used WHOLE (not first-token) because the user picked it
// specifically as their display string — "DROdio" and "Mary Beth" are both
// legitimate nicknames in their entirety. The other two sources go through a
// first-token reduction because Clerk's `firstName` is user-controlled (default
// Clerk UI / OAuth claims routinely deposit a full name there) and `fallbackName`
// is always a full name.
export function firstNameFor(
  nickname: string | null | undefined,
  clerkFirstName: string | null | undefined,
  fallbackName?: string | null,
): string {
  const n = nickname?.trim() || undefined;
  const firstToken = (s: string | null | undefined) =>
    s?.trim().split(/\s+/)[0] || undefined;
  return n ?? firstToken(clerkFirstName) ?? firstToken(fallbackName) ?? "there";
}

export function renderClaimWelcomeEmail(opts: {
  firstName: string;
  profileUrl: string;
  short: boolean;
}): { subject: string; html: string } {
  const name = escapeHtml(opts.firstName);
  const url = escapeHtml(opts.profileUrl);
  if (opts.short) {
    return {
      subject: "+ profile! what to build next?",
      html: [
        `<p>${name},</p>`,
        `<p>Saw you <em>also</em> created a profile on Festival: <a href="${url}">${url}</a></p>`,
        `<p>How'd you hear about it?</p>`,
        INTRO_HTML,
        FESTIVAL_FEEDBACK_HTML,
        SIGNOFF_HTML,
      ].join("\n"),
    };
  }
  return {
    subject: `${opts.firstName} - Welcome to Founder Festival + what to build? (and FYI on API)`,
    html: [
      `<p>${name}, saw you created a profile on Festival: <a href="${url}">${url}</a></p>`,
      `<p>How'd you hear about it?</p>`,
      INTRO_HTML,
      FESTIVAL_FEEDBACK_HTML,
      `<p>LMK if you try using the ${FESTIVAL_API_LINK} to build an app that uses founder &amp; investor scoring into any agentic systems you have. I'll be happy to feature your work. (I made it hella easy to drop into Claude Code or similar.)</p>`,
      SIGNOFF_HTML,
    ].join("\n"),
  };
}

export function renderDevApiWelcomeEmail(opts: {
  firstName: string;
  short: boolean;
}): { subject: string; html: string } {
  const name = escapeHtml(opts.firstName);
  if (opts.short) {
    return {
      subject: "+ LMK what you do with the Festival Developer API! + ideas?",
      html: [
        `<p>${name},</p>`,
        `<p>Saw you <em>also</em> signed up for the Festival developer API. I'm very interested to see what you do with it, and how I can support you!</p>`,
        `<p>I'd love to get your feedback on the API. What other endpoints would you like to see exposed?</p>`,
        SIGNOFF_HTML,
      ].join("\n"),
    };
  }
  return {
    subject: `${opts.firstName} - LMK what you do with the Festival Developer API! + ideas?`,
    html: [
      `<p>${name},</p>`,
      `<p>Saw you signed up for the Festival developer API. I'm very interested to see what you do with it, and how I can support you!</p>`,
      `<p>BTW, how'd you hear about it?</p>`,
      INTRO_HTML,
      `<p>I'd love to get your feedback on the ${FESTIVAL_API_LINK}. What other endpoints would you like to see exposed?</p>`,
      SIGNOFF_HTML,
    ].join("\n"),
  };
}

export async function sendClaimWelcomeEmail(opts: {
  to: string;
  firstName: string;
  profileUrl: string;
  short: boolean;
}): Promise<{ id: string }> {
  const { subject, html } = renderClaimWelcomeEmail(opts);
  return sendRawEmail({ from: FROM_DRODIO, to: opts.to, cc: WELCOME_CC, subject, html });
}

export async function sendDevApiWelcomeEmail(opts: {
  to: string;
  firstName: string;
  short: boolean;
}): Promise<{ id: string }> {
  const { subject, html } = renderDevApiWelcomeEmail(opts);
  return sendRawEmail({ from: FROM_DRODIO, to: opts.to, cc: WELCOME_CC, subject, html });
}

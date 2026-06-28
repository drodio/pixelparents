import { Resend } from "resend";
import { getRenderedEmailSignature } from "@/lib/email-signature";

// SECURITY: All fields interpolated into the HTML templates below are
// operator-controlled (event titles, venues, Luma URLs configured by admins).
// Do NOT add applicant-supplied data (display names, notes, company text)
// without HTML-escaping it first. We avoid a templating dep for now;
// when applicant data lands, switch to a small escape helper.

const FROM = process.env.RESEND_FROM ?? "Founder Festival <hello@festival.so>";

// SECURITY (P0-2): validate a single applicant-supplied email before we store it
// (and before any downstream send to it). Rejects malformed addresses and —
// critically — anything with whitespace/control chars, which blocks header- and
// recipient-injection via embedded CR/LF. RFC 5321 caps an address at 254 chars.
export function isValidApplicantEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const e = email.trim();
  if (e.length < 3 || e.length > 254) return false;
  // No whitespace/control chars anywhere; exactly one local@domain with a TLD dot.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// Parse an operator-typed BCC field (comma/semicolon/whitespace separated) into a
// clean, deduped list of valid addresses. Lowercased; invalid tokens are DROPPED
// (the caller decides whether "raw non-empty but list empty" is an error). Reuses
// isValidApplicantEmail so the same CRLF/header-injection guard applies to BCCs.
export function parseBccList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of raw.split(/[\s,;]+/)) {
    const e = token.trim().toLowerCase();
    if (!e || seen.has(e) || !isValidApplicantEmail(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

// Lazy init: `new Resend("")` throws in resend@6.12.3, so defer construction
// until the first send. Tests that mock `@/lib/email` never call `client()`;
// tests that mock the `resend` module pass through their mocked constructor.
let _resend: Resend | null = null;
function client(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY ?? "");
  }
  return _resend;
}

function fmtDate(d: Date) {
  return d.toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
    timeZone: "America/Los_Angeles",
  });
}

// The DROdio sign-off is appended to EVERY outgoing email (product decision).
// Its text is an editable super-admin setting ("Email options") — see
// @/lib/email-signature. Individual templates must NOT include their own closing
// sign-off; this is the single source. Full-document emails (with a </body>) get
// it injected just before the close; plain fragments get it appended.
function withEmailSignature(html: string, sigHtml: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${sigHtml}</body>`);
  }
  return html + sigHtml;
}

// Append the current (DB-backed, admin-editable) signature to a body. Exported
// so the separate admin-alert sender can reuse the exact same logic.
export async function appendSignature(html: string): Promise<string> {
  return withEmailSignature(html, await getRenderedEmailSignature());
}

// Single internal send chokepoint: appends the signature to every email and
// centralizes Resend error handling. `to` may be one address or several.
async function rawSend(opts: {
  from: string;
  to: string | string[];
  cc?: string;
  replyTo?: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const { data, error } = await client().emails.send({
    from: opts.from,
    to: opts.to,
    ...(opts.cc ? { cc: opts.cc } : {}),
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    subject: opts.subject,
    html: await appendSignature(opts.html),
  });
  if (error) throw new Error(`resend: ${error.message}`);
  return { id: data?.id ?? "" };
}

// Generic one-off sender — used by lifecycle welcome emails which build their
// own subject/html and need a custom from/cc. Throws on Resend error.
export async function sendRawEmail(opts: {
  from: string;
  to: string;
  cc?: string;
  replyTo?: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  return rawSend(opts);
}

// Like sendRawEmail but does NOT auto-append the global signature. For senders
// that compose their OWN complete body (own signature + footer) — e.g. the event
// email composer, where the admin can edit the signature per-send. Throws on
// Resend error.
export async function sendRawEmailWithoutSignature(opts: {
  from: string;
  to: string;
  cc?: string;
  bcc?: string | string[];
  replyTo?: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const hasBcc = Array.isArray(opts.bcc) ? opts.bcc.length > 0 : !!opts.bcc;
  const { data, error } = await client().emails.send({
    from: opts.from,
    to: opts.to,
    ...(opts.cc ? { cc: opts.cc } : {}),
    ...(hasBcc ? { bcc: opts.bcc } : {}),
    ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    subject: opts.subject,
    html: opts.html,
  });
  if (error) throw new Error(`resend: ${error.message}`);
  return { id: data?.id ?? "" };
}

// Minimal HTML escape for user-supplied values interpolated into email HTML
// (per the security note above). fromName is a requester's profile name and is
// NOT operator-controlled, so it must be escaped.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Notify a profile that a fellow attendee wants to connect. The approve/deny
// links land on a confirmation page (not a one-click GET) so email scanners
// can't auto-decide. manageUrl points at the event recap where the recipient
// can set per-group / global auto-handling preferences.
export async function sendConnectionRequestEmail(opts: {
  to: string;
  fromName: string;
  fromUrl?: string;
  eventTitle: string;
  eventUrl?: string;
  eventDate?: string;
  approveUrl: string;
  denyUrl: string;
  manageUrl: string;
}) {
  // fromName is user-supplied (a profile name) → escape. eventTitle is
  // operator-controlled but escaped too for defense in depth.
  const fromName = escapeHtml(opts.fromName);
  const eventTitle = escapeHtml(opts.eventTitle);
  // The requester's name links to their profile and the event name links to the
  // event page (fall back to plain bold text if a URL isn't available).
  const fromLink = opts.fromUrl
    ? `<a href="${opts.fromUrl}" style="color:#2563eb;">${fromName}</a>`
    : fromName;
  const eventLink = opts.eventUrl
    ? `<a href="${opts.eventUrl}" style="color:#2563eb;">${eventTitle}</a>`
    : eventTitle;
  // Date lives in the BODY (not the subject), in the festival's timezone.
  const dateStr = opts.eventDate ? ` on ${escapeHtml(opts.eventDate)}` : "";
  return rawSend({
    from: FROM,
    to: opts.to,
    subject: `${opts.fromName} wants to connect: ${opts.eventTitle}`,
    html: `
      <p><strong>${fromLink}</strong> attended <strong>${eventLink}</strong>${dateStr} and would like to connect with you.</p>
      <p>
        <a href="${opts.approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Approve</a>
        &nbsp;
        <a href="${opts.denyUrl}" style="display:inline-block;background:transparent;border:1px solid #dc2626;color:#dc2626;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;">Deny</a>
      </p>
      <p style="color:#666;font-size:13px;">If you approve, we&#39;ll email an intro to you both.</p>
      <p style="color:#666;font-size:13px;"><a href="${opts.manageUrl}">Manage who can connect with you</a> — auto-approve or auto-deny future requests from founders, investors, or sponsors, for this event or everywhere.</p>
    `,
  });
}

// Notify the REQUESTER that their connection request is pending. Sent right
// after we email the recipient for approval. Gives the requester links to manage
// their per-event and global auto-accept preferences, and a nudge to fill in
// their family profile. fromName/eventTitle escaped; URLs are app-built.
export async function sendConnectionPendingEmail(opts: {
  to: string;
  toName: string;
  eventTitle: string;
  eventUrl: string;
  accountUrl: string;
}) {
  const toName = escapeHtml(opts.toName);
  const eventTitle = escapeHtml(opts.eventTitle);
  return rawSend({
    from: FROM,
    to: opts.to,
    subject: `PENDING: Connection request to ${opts.toName} from ${opts.eventTitle}`,
    html: `
      <p>You've asked <strong>${toName}</strong> to connect with you from <strong>${eventTitle}</strong>. We've sent them an email to approve your request.</p>
      <p>Here's what you can do next:</p>
      <ul>
        <li><a href="${opts.eventUrl}">Manage your connection preferences</a> for ${eventTitle}: You can auto-accept all requests from this event if desired.</li>
        <li><a href="${opts.accountUrl}">Manage your global connection defaults</a> in your account: You can auto-accept all requests from any future event if desired.</li>
        <li>While you're in your account: Do you have partners, kids or pets? If so, fill in your account profile so we can invite you to specific events that are partner, kids &amp; pets specific.</li>
      </ul>
    `,
  });
}

export async function sendApprovedEmail(opts: {
  to: string;
  eventTitle: string;
  startsAt: Date;
  venue: string | null;
  lumaUrl: string | null;
  score?: { founder: number; investor: number } | null;
}) {
  const venueLine = opts.venue ? `<p><strong>Where:</strong> ${opts.venue}</p>` : "";
  const lumaLine = opts.lumaUrl && /^https:\/\//.test(opts.lumaUrl)
    ? `<p><a href="${opts.lumaUrl}">Confirm your RSVP and add to calendar</a></p>`
    : "";
  const scoreLine = opts.score
    ? `<p style="color:#666;font-size:13px;">Your FounderScore: <strong>${opts.score.founder}</strong>${opts.score.investor > 0 ? ` · InvestorScore: <strong>${opts.score.investor}</strong>` : ""}</p>`
    : "";
  return rawSend({
    from: FROM,
    to: opts.to,
    subject: `You're in: ${opts.eventTitle}`,
    html: `
      <p>You're confirmed for <strong>${opts.eventTitle}</strong>.</p>
      <p><strong>When:</strong> ${fmtDate(opts.startsAt)}</p>
      ${venueLine}
      ${lumaLine}
      ${scoreLine}
    `,
  });
}

export async function sendFutureEventsEmail(opts: {
  to: string;
  eventTitle: string;
}) {
  return rawSend({
    from: FROM,
    to: opts.to,
    subject: `Thanks for applying to ${opts.eventTitle}`,
    html: `
      <p>Thanks for applying to <strong>${opts.eventTitle}</strong>.</p>
      <p>This particular gathering is at capacity, but we'd love to keep you on the list for future Founder Festival events that match.</p>
    `,
  });
}

// Build the double-opt-in introduction email sent to BOTH people when a
// connection request is approved. Pure (no send) so it's unit-testable. Names
// are user-supplied → escaped. eventUrl/profileUrls are app-built → trusted.
export function buildConnectionIntroEmail(opts: {
  nameA: string;
  nameB: string;
  eventTitle: string;
  eventUrl: string;
  dateStr: string;
  profileUrlA: string;
  profileUrlB: string;
  // Per-person credibility title + (when one exists) a ready dossier share link.
  titleA?: string | null;
  titleB?: string | null;
  dossierUrlA?: string | null;
  dossierUrlB?: string | null;
}): { subject: string; html: string } {
  const a = escapeHtml(opts.nameA);
  const b = escapeHtml(opts.nameB);
  const title = escapeHtml(opts.eventTitle);
  const date = escapeHtml(opts.dateStr);
  const subject = `Festival: Connecting ${opts.nameA} ←→ ${opts.nameB} from ${opts.eventTitle} on ${opts.dateStr}`;
  // Deep-link to the event's chat section.
  const chatUrl = `${opts.eventUrl}${opts.eventUrl.includes("?") ? "&" : "?"}section=chat`;
  // Each bullet: bold linked name, then their title, then a dossier link if ready.
  const li = (nameEsc: string, profileUrl: string, t?: string | null, dossierUrl?: string | null) =>
    `<li><a href="${profileUrl}"><strong>${nameEsc}</strong></a>` +
    `${t?.trim() ? `: ${escapeHtml(t.trim())}` : ""}` +
    `${dossierUrl ? ` (+ view their <a href="${dossierUrl}">Deep Intelligence dossier</a>)` : ""}</li>`;
  const html = `
      <p>${a} &amp; ${b}, you both wanted to connect from <a href="${opts.eventUrl}">${title}</a> on ${date}. Here are your profiles:</p>
      <ul>
        ${li(a, opts.profileUrlA, opts.titleA, opts.dossierUrlA)}
        ${li(b, opts.profileUrlB, opts.titleB, opts.dossierUrlB)}
      </ul>
      <p>You can also chat, reply &amp; upvote comments with other event attendees <a href="${chatUrl}">right here</a>.</p>
      <p>Hope it&#39;s a valuable connection!</p>
    `;
  return { subject, html };
}

// Send the intro to both people at once (to: [a, b]) so a reply-all connects
// them. Throws on Resend error (callers wrap best-effort).
export async function sendConnectionIntroEmail(opts: {
  toEmails: string[];
  nameA: string;
  nameB: string;
  eventTitle: string;
  eventUrl: string;
  dateStr: string;
  profileUrlA: string;
  profileUrlB: string;
  titleA?: string | null;
  titleB?: string | null;
  dossierUrlA?: string | null;
  dossierUrlB?: string | null;
}): Promise<{ id: string }> {
  const { subject, html } = buildConnectionIntroEmail(opts);
  return rawSend({ from: FROM, to: opts.toEmails, subject, html });
}

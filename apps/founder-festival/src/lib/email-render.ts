// Pure (DB-free) email rendering shared by the server send path AND the client
// live-preview pane. Keeping it dependency-free is deliberate: a client component
// can import these without dragging the DB module into the browser bundle (see the
// "client DB-import crash" footgun). Because the preview and the real send call
// the SAME functions here, what the admin previews is exactly what ships.

import {
  renderTemplate,
  buildRecipientValues,
  htmlToText,
  type EventForVars,
} from "@/lib/email-variables";

// One resolved recipient of a campaign (snapshot taken at compose time).
export type CampaignRecipient = {
  toEmail: string;
  clerkUserId: string | null;
  evaluationId: string | null;
  fullName: string | null;
  nickname: string | null;
  profileHref: string | null;
  companyName: string | null;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Render the plain-text signature into the HTML appended to every email.
// Mid-gray (#888) so it reads on both light and dark templates. Newlines become
// <br>; a bare email address is linkified.
export function renderSignatureHtml(text: string): string {
  const linked = escapeHtml(text).replace(
    /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    '<a href="mailto:$1" style="color:#888;">$1</a>',
  );
  const body = linked.replace(/\n/g, "<br>");
  return `<div style="margin-top:22px;color:#888;font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;">${body}</div>`;
}

// Does this body template look like rich HTML (from the WYSIWYG editor) rather
// than the legacy plain-text marker template? A real tag (`<p>`, `<strong>`,
// `<a …>`, `<span …>`, `<br>`, etc.) decides it. Stray "<" in plain text (e.g.
// "<3") has no letter after "<" and so stays on the plain-text path.
export function looksLikeHtmlBody(s: string): boolean {
  return /<\/?[a-z][a-z0-9]*(\s[^>]*)?>/i.test(s);
}

// Defense-in-depth sanitizer for admin-authored email HTML (kept inline so this
// module stays DB-free and client-importable). Strips <script>/<style>, inline
// on* handlers (quoted AND unquoted), and neutralizes dangerous URL schemes
// (javascript:/data:/vbscript:) — but only inside href/src attribute values, so a
// literal "javascript:" written in the body text is preserved. The editor only
// produces a small tag whitelist anyway; this is belt-and-suspenders.
export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script>/gi, "")
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(\b(?:href|src)\s*=\s*")\s*(?:javascript|data|vbscript):[^"]*(")/gi, "$1#$2")
    .replace(/(\b(?:href|src)\s*=\s*')\s*(?:javascript|data|vbscript):[^']*(')/gi, "$1#$2")
    .replace(/(\b(?:href|src)\s*=\s*)(?:javascript|data|vbscript):[^\s>]*/gi, "$1#");
}

// Wrap a bare URL in an <a>, peeling trailing sentence punctuation (".", ",",
// ")", …) so it isn't swallowed into the href — but KEEPING a closing ")" that
// balances a "(" inside the URL (e.g. Wikipedia "…/Foo_(bar)").
function wrapBareUrls(s: string): string {
  return s.replace(/(https?:\/\/[^\s<]+)/g, (m) => {
    let url = m;
    let trail = "";
    while (/[.,;:!?)\]]$/.test(url)) {
      if (url.endsWith(")")) {
        const opens = (url.match(/\(/g) ?? []).length;
        const closes = (url.match(/\)/g) ?? []).length;
        if (closes <= opens) break; // balanced paren — part of the URL, keep it
      }
      trail = url.slice(-1) + trail;
      url = url.slice(0, -1);
    }
    return `<a href="${url}" style="color:#2563eb;">${url}</a>${trail}`;
  });
}

// Linkify bare URLs that aren't already inside an <a>…</a> — so a pasted profile
// URL (or {{profile-url}} that resolved to one) becomes clickable, while explicit
// links the admin made (and member-mention links) are left exactly as authored.
export function linkifyOutsideAnchors(html: string): string {
  // Odd-indexed parts are whole anchors (kept verbatim); even-indexed are text.
  return html
    .split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi)
    .map((part, i) => (i % 2 === 1 ? part : wrapBareUrls(part)))
    .join("");
}

// Unwrap the editor's variable-pill scaffolding (<span data-var-pill …>VALUE</span>)
// to just VALUE, so outgoing email doesn't carry internal authoring markup. Runs
// AFTER variable substitution, where VALUE is the resolved value rendered with
// escapeValues — so it's HTML-escaped text and can never contain a nested <span>;
// the non-greedy match to the first </span> is therefore always correct here.
export function unwrapPillSpans(html: string): string {
  return html.replace(/<span\b[^>]*\bdata-var-pill\b[^>]*>([\s\S]*?)<\/span>/gi, "$1");
}

// Merge `margin:0` into a paragraph's attribute string, preserving any existing
// attributes and folding into an existing inline `style` (idempotent — never adds
// a second style attribute or a duplicate margin). Handles single- and double-
// quoted styles, and leaves any pre-existing margin (shorthand OR longhand like
// margin-top) untouched so we never silently reset intentional spacing.
//
// In practice the only paragraphs reaching this are TipTap's bare `<p>` (rarely
// `<p dir=…>`) — it never emits inline margins — so the "already has a margin"
// branch is a safety net for pasted/foreign HTML, not a spacing path we produce.
// We deliberately don't try to per-side-zero a partial longhand margin: that case
// doesn't occur from our editor and isn't worth the extra branching.
function withParagraphMargin0(attrs: string): string {
  const m = attrs.match(/\sstyle\s*=\s*("[^"]*"|'[^']*')/i);
  if (!m) return `${attrs} style="margin:0"`;
  const quote = m[1][0]; // preserve the original quote style
  const existing = m[1].slice(1, -1).trim().replace(/;\s*$/, "");
  const hasMargin = /(^|;)\s*margin(-[a-z]+)?\s*:/i.test(existing);
  const merged = hasMargin ? existing : existing ? `${existing};margin:0` : "margin:0";
  return attrs.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/i, ` style=${quote}${merged}${quote}`);
}

// Make block spacing deterministic so the in-app preview and the delivered email
// look identical. TipTap serializes a deliberate blank line as an empty <p></p>,
// which collapses to zero height (both under the app's CSS reset and in email
// clients) — so the blank line vanishes. We turn empty/whitespace-only paragraphs
// into a real blank line and pin every paragraph's margin to 0 via an inline style
// (inline styles win in every environment), matching the editor where the admin
// adds blank lines explicitly. Handles paragraphs with attributes too. One pass,
// so margins are never doubled. Headings/lists keep their own spacing.
export function normalizeEmailBlocks(html: string): string {
  return html.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (_m, attrs: string, inner: string) => {
    const isBlank = inner.replace(/&nbsp;|<br\s*\/?>/gi, "").trim() === "";
    return `<p${withParagraphMargin0(attrs)}>${isBlank ? "&nbsp;" : inner}</p>`;
  });
}

const EMAIL_FOOTER = (unsubscribeUrl: string) =>
  `<div style="margin-top:28px;padding-top:14px;border-top:1px solid #eee;color:#9ca3af;font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;">` +
  `Don't want to receive future event-related email? ` +
  `<a href="${escapeHtml(unsubscribeUrl)}" style="color:#9ca3af;">Change your preferences here</a>.` +
  `</div>`;

const EMAIL_WRAPPER_OPEN = `<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;">`;

// Plain-text body → safe HTML: escape, linkify bare URLs, newlines → <br>, then
// append the (per-send, editable) signature and the unsubscribe footer. This is
// the renderer the preview pane AND the real send both call for legacy plain-text
// templates (those without any HTML tags).
export function buildEmailHtml(opts: {
  bodyText: string;
  signatureText: string;
  unsubscribeUrl: string;
}): string {
  const linkified = wrapBareUrls(escapeHtml(opts.bodyText));
  const body = linkified.replace(/\n/g, "<br>");
  const sig = opts.signatureText.trim() ? renderSignatureHtml(opts.signatureText) : "";
  return `${EMAIL_WRAPPER_OPEN}${body}${sig}${EMAIL_FOOTER(opts.unsubscribeUrl)}</div>`;
}

// Rich-HTML body (already variable-substituted with escaped values) → final email
// HTML: sanitize, linkify bare URLs outside existing anchors, then append the
// signature + unsubscribe footer in the same envelope as the plain-text path.
export function buildEmailHtmlFromHtml(opts: {
  bodyHtml: string;
  signatureText: string;
  unsubscribeUrl: string;
}): string {
  const body = normalizeEmailBlocks(linkifyOutsideAnchors(sanitizeEmailHtml(opts.bodyHtml)));
  const sig = opts.signatureText.trim() ? renderSignatureHtml(opts.signatureText) : "";
  return `${EMAIL_WRAPPER_OPEN}${body}${sig}${EMAIL_FOOTER(opts.unsubscribeUrl)}</div>`;
}

// Render one recipient's subject + plain-text body + final HTML. `event` and
// `personalizedHtml` are resolved by the caller (re-resolved at send time so a
// scheduled blast reflects current event details).
export function renderForRecipient(opts: {
  subjectTemplate: string;
  bodyTemplate: string;
  signatureText: string;
  recipient: CampaignRecipient;
  event: EventForVars;
  personalizedHtml: string | null;
  connectionsHtml?: string | null;
  baseUrl: string;
}): { subject: string; bodyText: string; html: string } {
  const values = buildRecipientValues({
    attendee: {
      fullName: opts.recipient.fullName,
      nickname: opts.recipient.nickname,
      profileHref: opts.recipient.profileHref,
      companyName: opts.recipient.companyName,
    },
    event: opts.event,
    personalizedHtml: opts.personalizedHtml,
    connectionsHtml: opts.connectionsHtml ?? null,
    baseUrl: opts.baseUrl,
  });
  const dateOpts = { eventStartsAt: opts.event.startsAt };
  const subject = renderTemplate(opts.subjectTemplate, values, dateOpts);
  const unsubscribeUrl = `${opts.baseUrl.replace(/\/+$/, "")}/account#event-notifications`;

  // Rich HTML body (WYSIWYG) vs legacy plain-text body. The HTML path escapes
  // substituted VALUES (so a recipient's name/URL can't break markup) and keeps
  // the authored tags; the plain path escapes the whole body and nl2br's it.
  if (looksLikeHtmlBody(opts.bodyTemplate)) {
    const substituted = renderTemplate(opts.bodyTemplate, values, { ...dateOpts, escapeValues: true });
    // Drop the pill scaffolding so recipients don't get internal authoring spans.
    const renderedHtml = unwrapPillSpans(substituted);
    const html = buildEmailHtmlFromHtml({ bodyHtml: renderedHtml, signatureText: opts.signatureText, unsubscribeUrl });
    // Plain-text copy (for the message log / account inbox).
    const bodyText = htmlToText(sanitizeEmailHtml(renderedHtml));
    return { subject, bodyText, html };
  }

  const bodyText = renderTemplate(opts.bodyTemplate, values, dateOpts);
  const html = buildEmailHtml({ bodyText, signatureText: opts.signatureText, unsubscribeUrl });
  return { subject, bodyText, html };
}

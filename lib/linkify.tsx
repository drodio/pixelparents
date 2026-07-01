import React from "react";

// Shared, SAFE linkifier for user-generated free text.
//
// Daniel asked to "make URLs clickable". This turns bare `http(s)://…` and
// `www.…` URLs inside PLAIN TEXT into real anchors, while rendering everything
// else as plain text. It never uses dangerouslySetInnerHTML, so there is no XSS
// surface: non-URL text is emitted as React text nodes (React escapes it), and
// the only markup produced is a fixed `<a>` whose href we build ourselves.
//
// Two entry points:
//   - linkifyToNodes(text): pure parser -> a serializable segment array. This is
//     what the unit tests exercise (no React render needed).
//   - <Linkify>{text}</Linkify>: the React component that maps those segments to
//     text nodes + amber, overflow-safe <a> links. Containers already use
//     `whitespace-pre-wrap`, so newlines/whitespace are preserved as-is.

export type LinkifySegment =
  | { kind: "text"; value: string }
  | { kind: "link"; href: string; text: string };

// Match a bare URL: either an explicit http(s):// URL or a www.-prefixed host.
// We keep the char class deliberately conservative (no spaces, no angle
// brackets/quotes) and strip trailing punctuation afterwards so a URL at the end
// of a sentence — `see https://a.com/x).` — doesn't swallow the `).`.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"')\]]*[^\s<>"')\].,;:!?]/gi;

// Fallback matcher for the (rare) case where a URL is a single char after the
// scheme (e.g. "http://a"): the main regex requires a non-punctuation final char
// which is fine here, but a lone "www." with nothing after shouldn't match. The
// main regex already handles this because `www.` alone has no trailing
// non-punctuation char to anchor on.

// Cap how many characters of a long URL we DISPLAY (the href is always the full
// URL). Prevents a giant URL from dominating the text; CSS break-all handles the
// rest.
const MAX_LINK_TEXT = 60;

function truncateForDisplay(url: string): string {
  if (url.length <= MAX_LINK_TEXT) return url;
  return `${url.slice(0, MAX_LINK_TEXT - 1)}…`;
}

// Build a safe href. `www.` URLs get an https:// scheme so they resolve as
// absolute links. Anything whose scheme isn't http/https is rejected (returns
// null) — belt-and-suspenders, since the regex only matches http(s)/www, this
// blocks e.g. a crafted `javascript:` that somehow slipped through.
export function safeHref(raw: string): string | null {
  const withScheme = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

// Pure parser: split `text` into ordered text/link segments. Non-URL runs are
// preserved verbatim (whitespace/newlines included). A matched URL that fails the
// safeHref check is emitted as plain text, never as a link.
export function linkifyToNodes(text: string | null | undefined): LinkifySegment[] {
  if (!text) return [];
  const segments: LinkifySegment[] = [];
  let last = 0;

  for (const m of text.matchAll(URL_RE)) {
    const match = m[0];
    const start = m.index ?? 0;
    const href = safeHref(match);
    if (href === null) {
      // Not a safe URL — leave it in the surrounding text run (handled below by
      // not advancing `last` past it here; we simply don't push a link).
      continue;
    }
    if (start > last) {
      segments.push({ kind: "text", value: text.slice(last, start) });
    }
    segments.push({ kind: "link", href, text: match });
    last = start + match.length;
  }

  if (last < text.length) {
    segments.push({ kind: "text", value: text.slice(last) });
  }
  return segments;
}

const LINK_CLS =
  "break-all text-amber-300 underline decoration-amber-300/40 underline-offset-2 hover:text-amber-200";

// React component: renders `text` with bare URLs turned into safe, amber,
// overflow-safe links and everything else as plain text. Safe to drop in
// anywhere a plain string was previously rendered inside a `whitespace-pre-wrap`
// container.
export function Linkify({ children }: { children: string | null | undefined }): React.ReactElement {
  const segments = linkifyToNodes(children);
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <React.Fragment key={i}>{seg.value}</React.Fragment>
        ) : (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={LINK_CLS}
          >
            {truncateForDisplay(seg.text)}
          </a>
        ),
      )}
    </>
  );
}

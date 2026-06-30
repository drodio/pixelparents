// Photo caption mentions. Captions are stored as plain strings with inline
// markers `@[Name](id)`, where `id` is a child's id (the people the uploader
// added). This keeps captions human-readable and dependency-free — no rich-text
// editor. `renderCaption` turns a stored caption into renderable segments;
// `MentionCaptionInput` produces the marker string.

export type CaptionSegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; name: string; id: string };

// Matches @[Display Name](id). Name = anything but `]`; id = anything but `)`.
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

export function serializeMention(name: string, id: string): string {
  return `@[${name}](${id})`;
}

export function renderCaption(caption: string): CaptionSegment[] {
  if (!caption || !caption.trim()) return [];
  const segments: CaptionSegment[] = [];
  let last = 0;
  for (const m of caption.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    if (start > last) segments.push({ kind: "text", text: caption.slice(last, start) });
    segments.push({ kind: "mention", name: m[1]!, id: m[2]! });
    last = start + m[0].length;
  }
  if (last < caption.length) segments.push({ kind: "text", text: caption.slice(last) });
  return segments;
}

export function extractMentionIds(caption: string): string[] {
  const ids: string[] = [];
  for (const m of caption.matchAll(MENTION_RE)) {
    if (!ids.includes(m[2]!)) ids.push(m[2]!);
  }
  return ids;
}

// --- Community @-mentions ----------------------------------------------------
// The Community board (post bodies + responses) reuses the SAME inline marker
// format as photo captions — `@[Display Name](signupId)` — so the parser above
// (renderCaption / extractMentionIds / serializeMention) works unchanged. The id
// is a signups.id (a verified member), not a child id. These helpers add the
// server-side normalization the board needs: validating that the mentions a
// client submitted actually correspond to members the server authorized.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Whether a mention id looks like a real signup uuid (defense in depth — a client
// could hand us a marker with a junk id). Non-uuid mention ids are dropped before
// we ever query or notify.
export function isMentionId(id: string): boolean {
  return UUID_RE.test(id);
}

// The DISTINCT, well-formed signup ids referenced by a body's markers, excluding
// `self` (you never notify yourself for mentioning yourself). Order-preserving.
export function mentionTargets(body: string, self?: string): string[] {
  const out: string[] = [];
  for (const id of extractMentionIds(body)) {
    if (!isMentionId(id)) continue;
    if (self && id === self) continue;
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// Flatten a body with markers to readable plain text, turning each `@[Name](id)`
// into "@Name". Used where a non-linked summary is wanted (e.g. the board card's
// line-clamped preview) so a raw marker never leaks into the UI.
export function mentionPlainText(body: string): string {
  let out = "";
  for (const seg of renderCaption(body)) {
    out += seg.kind === "text" ? seg.text : `@${seg.name}`;
  }
  return out;
}

// Re-serialize a body so every mention marker uses the AUTHORITATIVE display name
// the server resolved for that id (from `nameById`), and any marker whose id the
// server did NOT authorize (unknown / unverified / not mentionable) is collapsed
// back to a plain "@Name" text run — so a client can never forge a link to an
// arbitrary id, and an unverified member is never turned into a live mention.
// Text runs pass through untouched.
export function normalizeMentions(
  body: string,
  nameById: Map<string, string>,
): string {
  let out = "";
  for (const seg of renderCaption(body)) {
    if (seg.kind === "text") {
      out += seg.text;
      continue;
    }
    const authoritativeName = nameById.get(seg.id);
    if (authoritativeName && isMentionId(seg.id)) {
      out += serializeMention(authoritativeName, seg.id);
    } else {
      // Not authorized → keep the human-readable "@Name", drop the link.
      out += `@${seg.name}`;
    }
  }
  return out;
}

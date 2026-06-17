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

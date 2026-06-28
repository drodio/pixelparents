// DB-free helpers for the event chat — safe to import from client components
// (importing "@/db" into the browser bundle crashes hydration). The server data
// layer lives in event-chat.ts.

export type ChatVisibility = "public" | "members" | "attendees";

export const CHAT_VISIBILITIES: ChatVisibility[] = ["public", "members", "attendees"];

export const VISIBILITY_LABEL: Record<ChatVisibility, string> = {
  public: "Public",
  members: "Members only",
  attendees: "Attendees only",
};

export function isChatVisibility(v: unknown): v is ChatVisibility {
  return v === "public" || v === "members" || v === "attendees";
}

// Length caps for chat input (DoS / abuse guard — these go straight into
// fire-and-forget mention emails, so unbounded text is expensive). Enforced at
// the route layer; shared here so the composer can mirror the limits.
export const CHAT_TITLE_MAX = 200;
export const CHAT_BODY_MAX = 5000;

// Returns a human error string if the (already-trimmed) title/body exceed the
// caps, else null. Title is optional (replies have no title).
export function chatLengthError(input: { title?: string; body: string }): string | null {
  if (input.title != null && input.title.length > CHAT_TITLE_MAX) {
    return `title must be ${CHAT_TITLE_MAX} characters or fewer`;
  }
  if (input.body.length > CHAT_BODY_MAX) {
    return `body must be ${CHAT_BODY_MAX} characters or fewer`;
  }
  return null;
}

type ViewerFlags = { isMember: boolean; isAttendee: boolean };

// Who can READ a thread/comment of this visibility. Comments inherit their
// thread's visibility, so callers pass the thread's value for both.
export function canViewChat(visibility: ChatVisibility, { isMember, isAttendee }: ViewerFlags): boolean {
  if (visibility === "public") return true;
  if (visibility === "members") return isMember;
  return isAttendee; // attendees
}

// Who can POST (create a thread of / reply within) this visibility. Posting
// always requires a claimed member; attendees-only additionally requires
// attending the event.
export function canPostChat(visibility: ChatVisibility, { isMember, isAttendee }: ViewerFlags): boolean {
  if (!isMember) return false;
  if (visibility === "attendees") return isAttendee;
  return true;
}

// @mention markers: @[Full Name](<evaluation uuid>). The autocomplete inserts
// these; we parse them for emailing + render them as profile links.
const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g;

// Distinct evaluation ids mentioned in a body (order preserved).
export function parseMentionedIds(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    const id = m[2]!.toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// The composer shows readable "@Full Name" text while tracking the picked
// member's id. On submit we convert each "@Full Name" back into a marker the
// server can parse. Longest names first so "@Sam" can't clobber "@Sam Odio".
export function serializeMentions(text: string, mentions: Array<{ name: string; evalId: string }>): string {
  let out = text;
  const sorted = [...mentions].sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    out = out.split(`@${m.name}`).join(`@[${m.name}](${m.evalId})`);
  }
  return out;
}

// Compact relative time ("2h", "3d", "just now") for chat timestamps.
export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(mo / 12)}y`;
}

// Comparator for ordering chat comments/replies: upvoted float to the top
// (score desc), and within the same score the newest comes first (createdAt
// desc — ISO strings sort lexicographically). Shared so the ordering is one
// definition and unit-testable.
export function rankChatNodes(
  a: { score: number; createdAt: string },
  b: { score: number; createdAt: string },
): number {
  return b.score - a.score || b.createdAt.localeCompare(a.createdAt);
}

// Re-resolve the display name inside @[Name](evalId) markers to the current
// preferred name (nickname when set). Markers store the name as typed at post
// time, so without this a member who later sets a nickname still shows their old
// full name in chat/emails. `names` maps evalId → preferred name; markers whose
// evalId isn't in the map keep their baked-in name. Pure/DB-free → server builds
// the map, this rewrites the stored body. Lookups are case-insensitive on id.
export function rewriteMentionNames(body: string, names: Map<string, string>): string {
  if (names.size === 0) return body;
  return body.replace(MENTION_RE, (full, _name, id) => {
    const preferred = names.get(String(id).toLowerCase());
    return preferred ? `@[${preferred}](${id})` : full;
  });
}

// Markers → readable plain text ("@[Sam Odio](uuid)" → "@Sam Odio"). Used for
// the thread title, which is rendered inside a link (so it can't contain nested
// mention links like a body does).
export function mentionsToText(s: string): string {
  return renderMentions(s)
    .map((seg) => seg.text)
    .join("");
}

export type MentionSegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; text: string; evalId: string };

// Split a body into text + mention segments for rendering (mentions → links).
export function renderMentions(body: string): MentionSegment[] {
  const segs: MentionSegment[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    if (start > last) segs.push({ kind: "text", text: body.slice(last, start) });
    segs.push({ kind: "mention", text: `@${m[1]}`, evalId: m[2]!.toLowerCase() });
    last = start + m[0].length;
  }
  if (last < body.length) segs.push({ kind: "text", text: body.slice(last) });
  return segs;
}

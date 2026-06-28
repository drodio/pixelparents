// Local-draft persistence for the event email composer. Pure + unit-tested: the
// composer keeps its state in React and uses these helpers to serialize a draft
// to localStorage (per event) so an unsent draft survives a refresh. Nothing here
// touches the DB or the network — a draft is purely client-side until it's sent.

export type EmailDraft = {
  from: string;
  bcc: string;
  subject: string;
  body: string;
  signature: string;
  // Selected recipient emails (lowercased), snapshotted from the picker.
  selected: string[];
  scheduleMode: "now" | "on";
  scheduleAt: string;
};

// One key per event so each event's composer keeps its own draft.
export function draftStorageKey(eventId: string): string {
  return `ff:email-draft:${eventId}`;
}

// A draft is "empty" (not worth persisting) when it has no actual composition.
// The prefilled signature and the from-address don't count as composition on
// their own — only a subject, body, BCC, recipients, or a schedule do.
export function isDraftEmpty(d: EmailDraft): boolean {
  return (
    !d.subject.trim() &&
    !d.body.trim() &&
    !d.bcc.trim() &&
    d.selected.length === 0 &&
    d.scheduleMode === "now" &&
    !d.scheduleAt
  );
}

export function serializeDraft(d: EmailDraft): string {
  return JSON.stringify(d);
}

// Parse a stored draft defensively — tolerate older/partial/corrupt shapes by
// only accepting fields of the expected type. Returns null when there's nothing
// usable, else a partial the caller applies field-by-field.
export function parseDraft(raw: string | null | undefined): Partial<EmailDraft> | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const out: Partial<EmailDraft> = {};
  if (typeof r.from === "string") out.from = r.from;
  if (typeof r.bcc === "string") out.bcc = r.bcc;
  if (typeof r.subject === "string") out.subject = r.subject;
  if (typeof r.body === "string") out.body = r.body;
  if (typeof r.signature === "string") out.signature = r.signature;
  if (Array.isArray(r.selected)) {
    out.selected = r.selected.filter((x): x is string => typeof x === "string");
  }
  if (r.scheduleMode === "now" || r.scheduleMode === "on") out.scheduleMode = r.scheduleMode;
  if (typeof r.scheduleAt === "string") out.scheduleAt = r.scheduleAt;
  return Object.keys(out).length > 0 ? out : null;
}

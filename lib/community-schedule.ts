// PURE, DB-free validators + normalizers for the Community board's SCHEDULING
// enrichment on offers/accepts: a responder may propose 1-3 specific date/time
// options, and (optionally) supply an executive-assistant (EA) email to CC on the
// intro email when their response is accepted. Shared by the server action and
// the unit tests so the rules can't silently diverge (same pattern as
// lib/ask-validate.ts). No PII is stored here — these are validators only.

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string; field: string };
export type Result<T> = Ok<T> | Err;

// At most 3 proposed slots (the project lead asked for 1-3). Zero is allowed —
// scheduling is optional, so a responder can skip it entirely.
export const MAX_SLOTS = 3;

// A conservative email shape — enough to reject obvious junk without trying to
// fully RFC-validate (the real check is deliverability at send time). Single
// address, no spaces, one @, a dotted domain.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EA_EMAIL_MAX = 254;

// Validate + normalize the proposed slots. Input is a list of ISO-ish datetime
// strings (the client sends `<input type="datetime-local">` values plus the same
// tz offset the events form uses, OR full ISO instants). Each must parse and be
// in the FUTURE; duplicates collapse; the count is capped at MAX_SLOTS. Empty
// input → [] (scheduling skipped). `now` is injectable for deterministic tests.
export function validateSlots(
  input: unknown,
  now: number = Date.now(),
): Result<Date[]> {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, error: "Invalid time options.", field: "slots" };
  }

  const seen = new Set<number>();
  const out: Date[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") {
      return { ok: false, error: "Enter a valid date and time for each option.", field: "slots" };
    }
    const trimmed = raw.trim();
    if (!trimmed) continue; // blank rows in the form are skipped, not errors
    const ms = Date.parse(trimmed);
    if (!Number.isFinite(ms)) {
      return { ok: false, error: "Enter a valid date and time for each option.", field: "slots" };
    }
    if (ms <= now) {
      return { ok: false, error: "Each proposed time must be in the future.", field: "slots" };
    }
    if (seen.has(ms)) continue; // de-dupe identical instants
    seen.add(ms);
    out.push(new Date(ms));
    if (out.length > MAX_SLOTS) {
      return {
        ok: false,
        error: `Propose at most ${MAX_SLOTS} time options.`,
        field: "slots",
      };
    }
  }
  // Soonest first for stable storage/display.
  out.sort((a, b) => a.getTime() - b.getTime());
  return { ok: true, value: out };
}

// Validate the optional EA email. Empty/absent → null (no CC). A provided value
// must look like a single email address. Lower-cased + trimmed for a stable store.
export function validateEaEmail(input: unknown): Result<string | null> {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (typeof input !== "string") {
    return { ok: false, error: "Enter a valid assistant email.", field: "eaEmail" };
  }
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > EA_EMAIL_MAX || !EMAIL_RE.test(trimmed)) {
    return { ok: false, error: "Enter a valid assistant email.", field: "eaEmail" };
  }
  return { ok: true, value: trimmed.toLowerCase() };
}

// Max length of the optional "I'd join this too" note.
export const ATTACH_NOTE_MAX = 200;

// Sanitize the optional attach/join note: collapse to a single line, strip
// control chars, trim, cap length. Empty → null (no note stored). Pure so the
// upvote/attach path's input handling is unit-tested alongside the validators.
export function sanitizeAttachNote(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const clean = input
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ATTACH_NOTE_MAX);
  return clean || null;
}

// Human label for a proposed slot in the intro email / UI. Locale-aware date +
// time. Falls back to the raw ISO if the Date is somehow invalid.
export function formatSlot(value: Date | string, locale?: string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return String(value);
  return d.toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

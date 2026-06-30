// PURE, DB-free validators + normalizers for event input. Shared by the server
// actions and the unit tests so the rules can't silently diverge (same shape as
// lib/ask-validate.ts). The form sends a date + time pair + a timezone offset; we
// resolve it to a UTC instant here so the calendar stores timezone-correct
// timestamptz values regardless of where the creator is.

export const EVENT_TITLE_MAX = 140;
export const EVENT_DESC_MAX = 4000;
export const EVENT_LOCATION_MAX = 200;
export const EVENT_URL_MAX = 500;

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string; field: string };
export type Result<T> = Ok<T> | Err;

function cleanLine(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMultiline(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

export function validateEventTitle(input: unknown): Result<string> {
  const v = cleanLine(input);
  if (!v) return { ok: false, error: "Add a title for your event.", field: "title" };
  if (v.length > EVENT_TITLE_MAX)
    return { ok: false, error: `Title must be ${EVENT_TITLE_MAX} characters or fewer.`, field: "title" };
  return { ok: true, value: v };
}

export function validateEventDescription(input: unknown): Result<string | null> {
  const v = cleanMultiline(input);
  if (!v) return { ok: true, value: null };
  if (v.length > EVENT_DESC_MAX)
    return { ok: false, error: `Please keep the description under ${EVENT_DESC_MAX} characters.`, field: "description" };
  return { ok: true, value: v };
}

export function validateLocation(input: unknown): Result<string | null> {
  const v = cleanLine(input);
  if (!v) return { ok: false, error: "Add a location for an in-person event.", field: "location" };
  if (v.length > EVENT_LOCATION_MAX)
    return { ok: false, error: `Location must be ${EVENT_LOCATION_MAX} characters or fewer.`, field: "location" };
  return { ok: true, value: v };
}

// An online event needs an http(s) URL. We reject other schemes (no javascript:,
// data:, etc.) so a stored link can never be an XSS vector when rendered as href.
export function validateOnlineUrl(input: unknown): Result<string> {
  const v = cleanLine(input);
  if (!v) return { ok: false, error: "Add the meeting link for an online event.", field: "onlineUrl" };
  if (v.length > EVENT_URL_MAX)
    return { ok: false, error: `Link must be ${EVENT_URL_MAX} characters or fewer.`, field: "onlineUrl" };
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return { ok: false, error: "Enter a valid URL (starting with https://).", field: "onlineUrl" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "The link must start with http:// or https://.", field: "onlineUrl" };
  }
  return { ok: true, value: url.toString() };
}

// Combine a date-only "YYYY-MM-DD" + time "HH:MM" + the client's timezone offset
// (minutes, as from Date.prototype.getTimezoneOffset — i.e. UTC = local + offset)
// into a UTC instant. Returns null for a missing/blank date.
//
// `offsetMinutes` defaults to 0 (UTC) so callers that already pass a UTC-ish
// value (or all-day events) get a stable instant. The offset is clamped to the
// real-world range so a bogus client value can't produce a wild date.
export function resolveInstant(
  dateStr: unknown,
  timeStr: unknown,
  offsetMinutes: unknown,
): Date | null {
  if (typeof dateStr !== "string") return null;
  const date = dateStr.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const [, y, mo, d] = m;

  let hh = 0;
  let mm = 0;
  if (typeof timeStr === "string" && timeStr.trim()) {
    const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
    if (!tm) return null;
    hh = Number(tm[1]);
    mm = Number(tm[2]);
    if (hh > 23 || mm > 59) return null;
  }

  let off = 0;
  if (typeof offsetMinutes === "number" && Number.isFinite(offsetMinutes)) {
    off = Math.max(-14 * 60, Math.min(14 * 60, Math.round(offsetMinutes)));
  }

  // Build the UTC instant: the local wall-clock time is (y-mo-d hh:mm) in a zone
  // whose offset is `off` minutes behind UTC, so UTC = local + off minutes.
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), hh, mm) + off * 60_000;
  const out = new Date(utcMs);
  return Number.isFinite(out.getTime()) ? out : null;
}

// Validate a resolved start/end pair. End is optional; when present it must be
// after start. Both must be finite dates.
export function validateRange(
  start: Date | null,
  end: Date | null,
): Result<{ startsAt: Date; endsAt: Date | null }> {
  if (!start || !Number.isFinite(start.getTime())) {
    return { ok: false, error: "Choose a valid start date and time.", field: "startsAt" };
  }
  if (end) {
    if (!Number.isFinite(end.getTime())) {
      return { ok: false, error: "Choose a valid end date and time.", field: "endsAt" };
    }
    if (end.getTime() <= start.getTime()) {
      return { ok: false, error: "The end time must be after the start time.", field: "endsAt" };
    }
  }
  return { ok: true, value: { startsAt: start, endsAt: end } };
}

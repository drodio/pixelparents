// PURE, DB-free validators + normalizers for ask/response input. Shared by the
// server actions and the unit tests so the rules can't silently diverge. Ported
// in shape from the founder-festival reference, but adapted to pixelparents:
// expertise tags here are FREE-TEXT (the directory uses free-text interests /
// skillsets, not a fixed industry slug list), so tags are sanitized + capped
// rather than constrained to a closed vocabulary.

import {
  ASK_PROPOSES,
  ASK_KINDS,
  ASK_URGENCIES,
  type AskProposes,
  type AskKind,
  type AskUrgency,
} from "@/lib/db/asks";

export const ASK_TITLE_MAX = 140;
export const ASK_BODY_MAX = 2000;
export const ASK_OFFER_MAX = 600;
export const ASK_TAGS_MAX = 8;
export const ASK_TAG_MAX_LEN = 40;

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string; field: string };
export type Result<T> = Ok<T> | Err;

// Collapse whitespace + strip control chars from a single-line field (title).
// All control chars (incl. CR/LF/tab) become spaces, then runs collapse to one.
function cleanLine(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalize a multi-line field (body / offer): CRLF→LF, strip control chars
// (except newline/tab), trim. Preserves paragraph breaks.
function cleanMultiline(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

export function validateAskTitle(input: unknown): Result<string> {
  const v = cleanLine(input);
  if (!v) return { ok: false, error: "Add a short title for your ask.", field: "title" };
  if (v.length > ASK_TITLE_MAX)
    return { ok: false, error: `Title must be ${ASK_TITLE_MAX} characters or fewer.`, field: "title" };
  return { ok: true, value: v };
}

export function validateAskBody(input: unknown): Result<string> {
  const v = cleanMultiline(input);
  if (!v) return { ok: false, error: "Describe what you need help with.", field: "body" };
  if (v.length > ASK_BODY_MAX)
    return { ok: false, error: `Please keep it under ${ASK_BODY_MAX} characters.`, field: "body" };
  return { ok: true, value: v };
}

export function validateAskOffer(input: unknown): Result<string> {
  const v = cleanMultiline(input);
  if (!v) return { ok: false, error: "Write a sentence or two about how you can help.", field: "offer" };
  if (v.length > ASK_OFFER_MAX)
    return { ok: false, error: `Please keep your offer under ${ASK_OFFER_MAX} characters.`, field: "offer" };
  return { ok: true, value: v };
}

// Sanitize free-text expertise tags: trim, drop blanks, cap each tag's length,
// de-dup case-insensitively (keeping first-seen display label), cap the count.
// Empty is allowed at the validator level — the create action requires >=1 so the
// matcher has something to match on.
export function sanitizeAskTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const byKey = new Map<string, string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const t = cleanLine(raw).slice(0, ASK_TAG_MAX_LEN);
    if (!t) continue;
    const k = t.toLowerCase();
    if (!byKey.has(k)) byKey.set(k, t);
    if (byKey.size >= ASK_TAGS_MAX) break;
  }
  return Array.from(byKey.values());
}

export function validateAskTags(input: unknown): Result<string[]> {
  const tags = sanitizeAskTags(input);
  if (tags.length === 0)
    return { ok: false, error: "Add at least one expertise tag so we can find helpers.", field: "tags" };
  return { ok: true, value: tags };
}

export function validateProposes(input: unknown): Result<AskProposes> {
  if (typeof input === "string" && (ASK_PROPOSES as readonly string[]).includes(input))
    return { ok: true, value: input as AskProposes };
  return { ok: false, error: "Choose how you'd like to connect.", field: "proposes" };
}

// Which direction the post is: an Ask (need help) or an Offer (can help).
export function validateKind(input: unknown): Result<AskKind> {
  if (typeof input === "string" && (ASK_KINDS as readonly string[]).includes(input))
    return { ok: true, value: input as AskKind };
  return { ok: false, error: "Choose whether this is an ask or an offer.", field: "kind" };
}

// How time-sensitive the post is. Defaults to 'normal' if omitted/blank so the
// urgency control is optional on the form, but a non-empty value must be valid.
export function validateUrgency(input: unknown): Result<AskUrgency> {
  if (input === undefined || input === null || input === "")
    return { ok: true, value: "normal" };
  if (typeof input === "string" && (ASK_URGENCIES as readonly string[]).includes(input))
    return { ok: true, value: input as AskUrgency };
  return { ok: false, error: "Choose a valid urgency.", field: "urgency" };
}

// Optional expiry. Empty/absent → no expiry (null). A provided value must parse
// as a date AND be in the future (a post can't expire in the past). Accepts an
// ISO string or a date-only "YYYY-MM-DD" (interpreted at end-of-day local-ish via
// Date parsing). `now` is injectable for deterministic tests.
export function validateValidUntil(
  input: unknown,
  now: number = Date.now(),
): Result<Date | null> {
  if (input === undefined || input === null) return { ok: true, value: null };
  if (typeof input !== "string") {
    return { ok: false, error: "Enter a valid date.", field: "validUntil" };
  }
  const trimmed = input.trim();
  if (!trimmed) return { ok: true, value: null };
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    return { ok: false, error: "Enter a valid date.", field: "validUntil" };
  }
  if (ms <= now) {
    return { ok: false, error: "The expiry date must be in the future.", field: "validUntil" };
  }
  return { ok: true, value: new Date(ms) };
}

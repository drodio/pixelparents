// PURE, DB-free validators for the Exchange thread (reply + event proposal). Kept
// separate from the server action so the rules can be unit-tested in isolation
// (same shape as lib/ask-validate.ts / lib/events/validate.ts).

import type { MessageVisibility } from "@/lib/db/exchange-thread";

export const REPLY_BODY_MAX = 2000;

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string; field: string };
export type Result<T> = Ok<T> | Err;

// Normalize a multi-line message body: CRLF→LF, strip control chars (except
// newline/tab), trim. Preserves paragraph breaks. Mirrors ask-validate's
// cleanMultiline so reply text is sanitized the same way as post/offer bodies.
function cleanMultiline(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

export function validateReplyBody(input: unknown): Result<string> {
  const v = cleanMultiline(input);
  if (!v) return { ok: false, error: "Write a reply.", field: "body" };
  if (v.length > REPLY_BODY_MAX)
    return { ok: false, error: `Please keep it under ${REPLY_BODY_MAX} characters.`, field: "body" };
  return { ok: true, value: v };
}

// The note attached to an event proposal is OPTIONAL — blank is fine.
export function validateProposalNote(input: unknown): Result<string | null> {
  if (input === undefined || input === null) return { ok: true, value: null };
  const v = cleanMultiline(input);
  if (!v) return { ok: true, value: null };
  if (v.length > REPLY_BODY_MAX)
    return { ok: false, error: `Please keep the note under ${REPLY_BODY_MAX} characters.`, field: "body" };
  return { ok: true, value: v };
}

// public | private — anything else falls back to public (the safe default: a
// forged value never accidentally hides a message from the other party).
export function validateVisibility(input: unknown): MessageVisibility {
  return input === "private" ? "private" : "public";
}

// ---------------------------------------------------------------------------
// Poll validators
// ---------------------------------------------------------------------------

export const POLL_QUESTION_MAX = 200;
export const POLL_OPTION_MAX = 80;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;

// Collapse a single-line value: CRLF/newlines/tabs → spaces, strip control chars,
// collapse runs of whitespace, trim. Poll questions/options are single-line.
function cleanSingleLine(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function validatePollQuestion(input: unknown): Result<string> {
  const v = cleanSingleLine(input);
  if (!v) return { ok: false, error: "Ask a question.", field: "question" };
  if (v.length > POLL_QUESTION_MAX)
    return {
      ok: false,
      error: `Please keep the question under ${POLL_QUESTION_MAX} characters.`,
      field: "question",
    };
  return { ok: true, value: v };
}

// Validate + normalize the option list: clean each, drop blanks, dedupe
// case-insensitively (preserving first-seen casing/order), then enforce the
// 2–6 count and per-option length. Returns the cleaned option array.
export function validatePollOptions(input: unknown): Result<string[]> {
  if (!Array.isArray(input)) return { ok: false, error: "Add some options.", field: "options" };
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of input) {
    const v = cleanSingleLine(raw);
    if (!v) continue;
    if (v.length > POLL_OPTION_MAX)
      return {
        ok: false,
        error: `Please keep each option under ${POLL_OPTION_MAX} characters.`,
        field: "options",
      };
    const key = v.toLowerCase();
    if (seen.has(key)) continue; // dedupe (case-insensitive)
    seen.add(key);
    cleaned.push(v);
  }
  if (cleaned.length < POLL_MIN_OPTIONS)
    return { ok: false, error: `Add at least ${POLL_MIN_OPTIONS} options.`, field: "options" };
  if (cleaned.length > POLL_MAX_OPTIONS)
    return { ok: false, error: `Use at most ${POLL_MAX_OPTIONS} options.`, field: "options" };
  return { ok: true, value: cleaned };
}

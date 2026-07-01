import { describe, it, expect } from "vitest";
import {
  validateReplyBody,
  validateProposalNote,
  validateVisibility,
  validatePollQuestion,
  validatePollOptions,
  REPLY_BODY_MAX,
  POLL_QUESTION_MAX,
  POLL_OPTION_MAX,
  POLL_MAX_OPTIONS,
} from "./exchange-thread-validate";

describe("validateReplyBody", () => {
  it("rejects an empty / whitespace-only body", () => {
    expect(validateReplyBody("").ok).toBe(false);
    expect(validateReplyBody("   \n  ").ok).toBe(false);
    expect(validateReplyBody(123).ok).toBe(false);
  });

  it("trims + normalizes CRLF and preserves paragraph breaks", () => {
    const res = validateReplyBody("  line one\r\n\r\nline two  ");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe("line one\n\nline two");
  });

  it("strips control chars but keeps newlines/tabs", () => {
    const res = validateReplyBody("a\x00b\tc");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe("ab\tc");
  });

  it("caps the length", () => {
    const long = "x".repeat(REPLY_BODY_MAX + 1);
    expect(validateReplyBody(long).ok).toBe(false);
    expect(validateReplyBody("x".repeat(REPLY_BODY_MAX)).ok).toBe(true);
  });
});

describe("validateProposalNote", () => {
  it("allows null/empty (note is optional)", () => {
    expect(validateProposalNote(null)).toEqual({ ok: true, value: null });
    expect(validateProposalNote(undefined)).toEqual({ ok: true, value: null });
    expect(validateProposalNote("   ")).toEqual({ ok: true, value: null });
  });

  it("keeps a real note and caps length", () => {
    const res = validateProposalNote("see you there");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe("see you there");
    expect(validateProposalNote("x".repeat(REPLY_BODY_MAX + 1)).ok).toBe(false);
  });
});

describe("validateVisibility", () => {
  it("only 'private' maps to private; everything else is public (safe default)", () => {
    expect(validateVisibility("private")).toBe("private");
    expect(validateVisibility("public")).toBe("public");
    expect(validateVisibility("bogus")).toBe("public");
    expect(validateVisibility(undefined)).toBe("public");
    expect(validateVisibility(null)).toBe("public");
    expect(validateVisibility(1)).toBe("public");
  });
});

describe("validatePollQuestion", () => {
  it("rejects empty / whitespace / non-string", () => {
    expect(validatePollQuestion("").ok).toBe(false);
    expect(validatePollQuestion("   ").ok).toBe(false);
    expect(validatePollQuestion(42).ok).toBe(false);
  });

  it("collapses internal whitespace/newlines and trims", () => {
    const res = validatePollQuestion("  Which\n\ttime   works?  ");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe("Which time works?");
  });

  it("strips control chars", () => {
    const res = validatePollQuestion("a\x00b");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toBe("ab");
  });

  it("caps at POLL_QUESTION_MAX", () => {
    expect(validatePollQuestion("x".repeat(POLL_QUESTION_MAX)).ok).toBe(true);
    expect(validatePollQuestion("x".repeat(POLL_QUESTION_MAX + 1)).ok).toBe(false);
  });
});

describe("validatePollOptions", () => {
  it("rejects a non-array", () => {
    expect(validatePollOptions("nope").ok).toBe(false);
    expect(validatePollOptions(null).ok).toBe(false);
  });

  it("requires at least 2 non-empty options", () => {
    expect(validatePollOptions(["only one"]).ok).toBe(false);
    expect(validatePollOptions(["a", "   "]).ok).toBe(false); // blank dropped → 1 left
    const res = validatePollOptions(["Yes", "No"]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual(["Yes", "No"]);
  });

  it("drops blanks and trims/collapses each option", () => {
    const res = validatePollOptions(["  Morning  ", "", "  After   noon "]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual(["Morning", "After noon"]);
  });

  it("dedupes case-insensitively, keeping first-seen casing", () => {
    const res = validatePollOptions(["Coffee", "coffee", "Tea"]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toEqual(["Coffee", "Tea"]);
  });

  it("rejects an option over POLL_OPTION_MAX", () => {
    expect(validatePollOptions(["ok", "x".repeat(POLL_OPTION_MAX + 1)]).ok).toBe(false);
  });

  it("rejects more than POLL_MAX_OPTIONS", () => {
    const many = Array.from({ length: POLL_MAX_OPTIONS + 1 }, (_, i) => `opt-${i}`);
    expect(validatePollOptions(many).ok).toBe(false);
    const max = Array.from({ length: POLL_MAX_OPTIONS }, (_, i) => `opt-${i}`);
    expect(validatePollOptions(max).ok).toBe(true);
  });
});

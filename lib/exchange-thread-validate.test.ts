import { describe, it, expect } from "vitest";
import {
  validateReplyBody,
  validateProposalNote,
  validateVisibility,
  REPLY_BODY_MAX,
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

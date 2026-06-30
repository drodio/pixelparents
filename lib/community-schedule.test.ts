import { describe, expect, it } from "vitest";
import {
  validateSlots,
  validateEaEmail,
  formatSlot,
  sanitizeAttachNote,
  ATTACH_NOTE_MAX,
  MAX_SLOTS,
} from "@/lib/community-schedule";

const NOW = Date.parse("2026-06-30T12:00:00Z");
const future = (h: number) => new Date(NOW + h * 3600_000).toISOString();
const past = (h: number) => new Date(NOW - h * 3600_000).toISOString();

describe("validateSlots", () => {
  it("treats null/undefined as no slots", () => {
    expect(validateSlots(undefined, NOW)).toEqual({ ok: true, value: [] });
    expect(validateSlots(null, NOW)).toEqual({ ok: true, value: [] });
  });

  it("accepts up to MAX_SLOTS future times, sorted soonest-first", () => {
    const res = validateSlots([future(48), future(2), future(24)], NOW);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(3);
      expect(res.value[0].getTime()).toBeLessThan(res.value[1].getTime());
      expect(res.value[1].getTime()).toBeLessThan(res.value[2].getTime());
    }
  });

  it("skips blank rows without erroring", () => {
    const res = validateSlots(["", future(2), "   "], NOW);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toHaveLength(1);
  });

  it("dedupes identical instants", () => {
    const res = validateSlots([future(2), future(2)], NOW);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toHaveLength(1);
  });

  it("rejects a past time", () => {
    const res = validateSlots([past(2)], NOW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.field).toBe("slots");
  });

  it("rejects an unparseable time", () => {
    const res = validateSlots(["not a date"], NOW);
    expect(res.ok).toBe(false);
  });

  it(`rejects more than ${MAX_SLOTS} distinct slots`, () => {
    const res = validateSlots([future(2), future(4), future(6), future(8)], NOW);
    expect(res.ok).toBe(false);
  });

  it("rejects a non-array", () => {
    expect(validateSlots("nope", NOW).ok).toBe(false);
    expect(validateSlots(123, NOW).ok).toBe(false);
  });

  it("rejects a non-string element", () => {
    expect(validateSlots([123], NOW).ok).toBe(false);
  });
});

describe("validateEaEmail", () => {
  it("treats empty/absent as null", () => {
    expect(validateEaEmail(undefined)).toEqual({ ok: true, value: null });
    expect(validateEaEmail("")).toEqual({ ok: true, value: null });
    expect(validateEaEmail("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts and lowercases a valid address", () => {
    expect(validateEaEmail("EA@Example.com")).toEqual({ ok: true, value: "ea@example.com" });
  });

  it("rejects junk", () => {
    expect(validateEaEmail("not-an-email").ok).toBe(false);
    expect(validateEaEmail("a@b").ok).toBe(false);
    expect(validateEaEmail("a b@c.com").ok).toBe(false);
  });

  it("rejects a non-string", () => {
    expect(validateEaEmail(42).ok).toBe(false);
  });
});

describe("sanitizeAttachNote (upvote/attach input)", () => {
  it("returns null for empty / non-string", () => {
    expect(sanitizeAttachNote("")).toBeNull();
    expect(sanitizeAttachNote("   ")).toBeNull();
    expect(sanitizeAttachNote(undefined)).toBeNull();
    expect(sanitizeAttachNote(42)).toBeNull();
  });
  it("collapses whitespace + strips control chars", () => {
    expect(sanitizeAttachNote("  I'd \n\t join   too ")).toBe("I'd join too");
  });
  it("caps length at ATTACH_NOTE_MAX", () => {
    const out = sanitizeAttachNote("x".repeat(ATTACH_NOTE_MAX + 50));
    expect(out).toHaveLength(ATTACH_NOTE_MAX);
  });
});

describe("formatSlot", () => {
  it("formats a Date to a human string", () => {
    const s = formatSlot(new Date(future(2)), "en-US");
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });
  it("falls back to the raw value for an invalid date", () => {
    expect(formatSlot("garbage")).toBe("garbage");
  });
});

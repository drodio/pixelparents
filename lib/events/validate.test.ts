import { describe, it, expect } from "vitest";
import {
  validateEventTitle,
  validateEventDescription,
  validateOnlineUrl,
  validateLocation,
  resolveInstant,
  validateRange,
} from "./validate";

describe("validateEventTitle", () => {
  it("trims + accepts a normal title", () => {
    const r = validateEventTitle("  Study Group  ");
    expect(r).toEqual({ ok: true, value: "Study Group" });
  });
  it("rejects empty", () => {
    expect(validateEventTitle("   ").ok).toBe(false);
  });
  it("rejects over-long", () => {
    expect(validateEventTitle("x".repeat(141)).ok).toBe(false);
  });
});

describe("validateEventDescription", () => {
  it("allows empty (null)", () => {
    expect(validateEventDescription("")).toEqual({ ok: true, value: null });
  });
  it("keeps multiline content", () => {
    const r = validateEventDescription("a\n\nb");
    expect(r.ok && r.value).toBe("a\n\nb");
  });
});

describe("validateOnlineUrl", () => {
  it("accepts https URLs", () => {
    const r = validateOnlineUrl("https://zoom.us/j/123");
    expect(r.ok).toBe(true);
  });
  it("rejects javascript: and other schemes", () => {
    expect(validateOnlineUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateOnlineUrl("data:text/html,x").ok).toBe(false);
  });
  it("rejects garbage", () => {
    expect(validateOnlineUrl("not a url").ok).toBe(false);
    expect(validateOnlineUrl("").ok).toBe(false);
  });
});

describe("validateLocation", () => {
  it("requires a non-empty place", () => {
    expect(validateLocation("").ok).toBe(false);
    expect(validateLocation("Boston, MA")).toEqual({ ok: true, value: "Boston, MA" });
  });
});

describe("resolveInstant", () => {
  it("resolves a UTC wall-clock time with zero offset", () => {
    const d = resolveInstant("2026-09-01", "18:30", 0);
    expect(d!.toISOString()).toBe("2026-09-01T18:30:00.000Z");
  });

  it("applies a timezone offset (UTC = local + offset minutes)", () => {
    // PDT is UTC-7, getTimezoneOffset() returns +420. 18:30 local → 01:30Z next day.
    const d = resolveInstant("2026-09-01", "18:30", 420);
    expect(d!.toISOString()).toBe("2026-09-02T01:30:00.000Z");
  });

  it("defaults time to midnight when omitted", () => {
    const d = resolveInstant("2026-09-01", "", 0);
    expect(d!.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("returns null for a malformed date", () => {
    expect(resolveInstant("2026/09/01", "18:30", 0)).toBeNull();
    expect(resolveInstant("nope", "", 0)).toBeNull();
  });

  it("rejects out-of-range times", () => {
    expect(resolveInstant("2026-09-01", "25:00", 0)).toBeNull();
    expect(resolveInstant("2026-09-01", "10:75", 0)).toBeNull();
  });
});

describe("validateRange", () => {
  const start = new Date("2026-09-01T18:00:00Z");
  it("accepts a start with no end", () => {
    const r = validateRange(start, null);
    expect(r.ok && r.value.endsAt).toBe(null);
  });
  it("accepts end after start", () => {
    const end = new Date("2026-09-01T19:00:00Z");
    expect(validateRange(start, end).ok).toBe(true);
  });
  it("rejects end before/equal start", () => {
    expect(validateRange(start, start).ok).toBe(false);
    expect(validateRange(start, new Date("2026-09-01T17:00:00Z")).ok).toBe(false);
  });
  it("rejects a null start", () => {
    expect(validateRange(null, null).ok).toBe(false);
  });
  it("allows a same-day all-day event (end === start) as an inclusive last day", () => {
    // Regression: a single-day all-day event with a matching end date resolves to
    // start === end (both UTC midnight) and was rejected with a timed-event error.
    const day = new Date(Date.UTC(2026, 7, 19)); // 8/19 UTC midnight
    const r = validateRange(day, day, true);
    expect(r.ok).toBe(true);
    expect(r.ok && r.value.endsAt?.getTime()).toBe(day.getTime());
  });
  it("still rejects an all-day end BEFORE start with day-oriented copy", () => {
    const start = new Date(Date.UTC(2026, 7, 19));
    const end = new Date(Date.UTC(2026, 7, 18));
    const r = validateRange(start, end, true);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/on or after/i);
  });
  it("timed events still require end strictly after start", () => {
    expect(validateRange(start, start, false).ok).toBe(false);
  });
});

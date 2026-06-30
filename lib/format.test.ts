import { describe, expect, it } from "vitest";
import { formatLastUsed, formatPhone } from "@/lib/format";

describe("formatPhone", () => {
  it("formats 10-digit US numbers as XXX-XXX-XXXX", () => {
    expect(formatPhone("2015550142")).toBe("201-555-0142");
    expect(formatPhone("(201) 555-0142")).toBe("201-555-0142");
  });

  it("formats 11-digit leading-1 numbers", () => {
    expect(formatPhone("12015550142")).toBe("1-201-555-0142");
    expect(formatPhone("+1 201 555 0142")).toBe("1-201-555-0142");
  });

  it("leaves international / unexpected / empty values unchanged", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
    expect(formatPhone(undefined)).toBe("");
  });
});

describe("formatLastUsed", () => {
  const now = new Date("2026-06-29T12:00:00Z");

  it("returns the never-used fallback for null/undefined/invalid", () => {
    expect(formatLastUsed(null, now)).toBe("Never used yet");
    expect(formatLastUsed(undefined, now)).toBe("Never used yet");
    expect(formatLastUsed("not-a-date", now)).toBe("Never used yet");
  });

  it("reads 'just now' for sub-minute and future (clock-skew) timestamps", () => {
    expect(formatLastUsed(new Date("2026-06-29T11:59:30Z"), now)).toBe("just now");
    expect(formatLastUsed(new Date("2026-06-29T12:00:30Z"), now)).toBe("just now");
  });

  it("reads relative minutes / hours / days with correct pluralization", () => {
    expect(formatLastUsed(new Date("2026-06-29T11:59:00Z"), now)).toBe("1 minute ago");
    expect(formatLastUsed(new Date("2026-06-29T11:30:00Z"), now)).toBe("30 minutes ago");
    expect(formatLastUsed(new Date("2026-06-29T11:00:00Z"), now)).toBe("1 hour ago");
    expect(formatLastUsed(new Date("2026-06-29T07:00:00Z"), now)).toBe("5 hours ago");
    expect(formatLastUsed(new Date("2026-06-28T12:00:00Z"), now)).toBe("1 day ago");
    expect(formatLastUsed(new Date("2026-06-26T12:00:00Z"), now)).toBe("3 days ago");
  });

  it("falls back to an absolute UTC date a week or older", () => {
    expect(formatLastUsed(new Date("2026-06-12T08:00:00Z"), now)).toBe("Jun 12, 2026");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatLastUsed("2026-06-29T11:30:00Z", now)).toBe("30 minutes ago");
  });
});

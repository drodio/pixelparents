import { describe, it, expect } from "vitest";
import { isPastEvent, visiblePhotos, canViewPhoto, sanitizeRecapHtml } from "@/lib/event-recap";

const now = new Date("2026-06-05T12:00:00Z");

describe("isPastEvent", () => {
  it("uses endsAt when present", () => {
    expect(isPastEvent({ startsAt: new Date("2026-06-01"), endsAt: new Date("2026-06-02") }, now)).toBe(true);
    expect(isPastEvent({ startsAt: new Date("2026-06-10"), endsAt: new Date("2026-06-11") }, now)).toBe(false);
  });
  it("falls back to startsAt when endsAt is null", () => {
    expect(isPastEvent({ startsAt: new Date("2026-06-04"), endsAt: null }, now)).toBe(true);
    expect(isPastEvent({ startsAt: new Date("2026-06-06"), endsAt: null }, now)).toBe(false);
  });
});

describe("visiblePhotos", () => {
  const photos = [
    { id: "1", visibility: "public" },
    { id: "2", visibility: "attendees" },
  ];
  it("non-attendees see only public", () => {
    expect(visiblePhotos(photos, { isAttendee: false }).map((p) => p.id)).toEqual(["1"]);
  });
  it("attendees see everything", () => {
    expect(visiblePhotos(photos, { isAttendee: true }).map((p) => p.id)).toEqual(["1", "2"]);
  });
});

describe("canViewPhoto", () => {
  const anon = { isClaimed: false, isAttendee: false };
  const claimed = { isClaimed: true, isAttendee: false };
  const attendee = { isClaimed: true, isAttendee: true };
  it("public → everyone", () => {
    expect(canViewPhoto("public", anon)).toBe(true);
    expect(canViewPhoto("public", claimed)).toBe(true);
  });
  it("claimed → claimed users + attendees, not anon", () => {
    expect(canViewPhoto("claimed", anon)).toBe(false);
    expect(canViewPhoto("claimed", claimed)).toBe(true);
    expect(canViewPhoto("claimed", attendee)).toBe(true);
  });
  it("attendees → attendees only", () => {
    expect(canViewPhoto("attendees", anon)).toBe(false);
    expect(canViewPhoto("attendees", claimed)).toBe(false);
    expect(canViewPhoto("attendees", attendee)).toBe(true);
  });
  it("unknown/legacy → treated as public", () => {
    expect(canViewPhoto("something", anon)).toBe(true);
  });
});

describe("sanitizeRecapHtml", () => {
  it("returns empty for nullish", () => {
    expect(sanitizeRecapHtml(null)).toBe("");
    expect(sanitizeRecapHtml(undefined)).toBe("");
  });
  it("keeps safe markup", () => {
    expect(sanitizeRecapHtml("<p>Hello <strong>world</strong></p>")).toBe(
      "<p>Hello <strong>world</strong></p>",
    );
  });
  it("strips scripts, inline handlers, and javascript: urls", () => {
    expect(sanitizeRecapHtml('<p onclick="x()">hi</p>')).toBe("<p>hi</p>");
    expect(sanitizeRecapHtml('<script>alert(1)</script><p>ok</p>')).toBe("<p>ok</p>");
    expect(sanitizeRecapHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a href="alert(1)">x</a>');
  });

  it("preserves a profile mention anchor (class + data-mention-id + internal href)", () => {
    const html =
      '<p>Great chat with <a href="/profile/founder/morgan-reyes" data-mention-id="eval-1" class="mention">Morgan Reyes</a>!</p>';
    expect(sanitizeRecapHtml(html)).toBe(html);
  });

  it("still strips a javascript: href and inline handler on a mention-shaped anchor", () => {
    expect(
      sanitizeRecapHtml('<a href="javascript:alert(1)" data-mention-id="x" onclick="x()">n</a>'),
    ).toBe('<a href="alert(1)" data-mention-id="x">n</a>');
  });
});

import { describe, it, expect } from "vitest";
import {
  buildIcs,
  escapeIcsText,
  foldLine,
  formatUtcStamp,
  formatUtcDate,
  googleCalendarUrl,
} from "./ics";

describe("escapeIcsText", () => {
  it("escapes backslash, semicolon, comma, and newline per RFC 5545", () => {
    expect(escapeIcsText("a;b,c\\d")).toBe("a\\;b\\,c\\\\d");
    expect(escapeIcsText("line1\nline2")).toBe("line1\\nline2");
    expect(escapeIcsText("line1\r\nline2")).toBe("line1\\nline2");
  });
  it("leaves colons untouched", () => {
    expect(escapeIcsText("12:30")).toBe("12:30");
  });
});

describe("foldLine", () => {
  it("leaves short lines unchanged", () => {
    expect(foldLine("SUMMARY:Hi")).toBe("SUMMARY:Hi");
  });
  it("folds lines longer than 75 octets with CRLF + space", () => {
    const long = "DESCRIPTION:" + "x".repeat(100);
    const folded = foldLine(long);
    expect(folded).toContain("\r\n ");
    // Every physical line is <= 75 octets.
    for (const piece of folded.split("\r\n")) {
      expect(new TextEncoder().encode(piece).length).toBeLessThanOrEqual(75);
    }
  });
});

describe("formatUtcStamp / formatUtcDate", () => {
  it("formats a UTC date-time as YYYYMMDDTHHMMSSZ", () => {
    expect(formatUtcStamp(new Date("2026-08-19T17:30:00Z"))).toBe("20260819T173000Z");
  });
  it("formats a UTC date as YYYYMMDD", () => {
    expect(formatUtcDate(new Date("2026-08-19T00:00:00Z"))).toBe("20260819");
  });
});

describe("buildIcs", () => {
  it("builds a valid timed VEVENT with CRLF endings", () => {
    const ics = buildIcs({
      uid: "evt-1@pixelparents",
      title: "Study Group",
      description: "Bring questions",
      location: "Library",
      start: new Date("2026-09-01T18:00:00Z"),
      end: new Date("2026-09-01T19:00:00Z"),
    });
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:evt-1@pixelparents");
    expect(ics).toContain("DTSTART:20260901T180000Z");
    expect(ics).toContain("DTEND:20260901T190000Z");
    expect(ics).toContain("SUMMARY:Study Group");
    expect(ics).toContain("LOCATION:Library");
    expect(ics).toContain("END:VEVENT");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("encodes all-day events with VALUE=DATE", () => {
    const ics = buildIcs({
      uid: "ohs-1",
      title: "Thanksgiving Holiday",
      start: new Date("2026-11-25T00:00:00Z"),
      end: new Date("2026-11-28T00:00:00Z"),
      allDay: true,
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261125");
    expect(ics).toContain("DTEND;VALUE=DATE:20261128");
  });

  it("appends the join link into the description for online events", () => {
    const ics = buildIcs({
      uid: "evt-2",
      title: "Zoom Talk",
      url: "https://example.com/meet",
      start: new Date("2026-09-01T18:00:00Z"),
    });
    expect(ics).toContain("Join: https://example.com/meet");
    expect(ics).toContain("URL:https://example.com/meet");
  });

  it("escapes special characters in summary", () => {
    const ics = buildIcs({
      uid: "evt-3",
      title: "Coffee, Cake; & Code",
      start: new Date("2026-09-01T18:00:00Z"),
    });
    expect(ics).toContain("SUMMARY:Coffee\\, Cake\\; & Code");
  });
});

describe("googleCalendarUrl", () => {
  it("builds a render template link with compact dates", () => {
    const url = googleCalendarUrl({
      uid: "evt-1",
      title: "Study Group",
      location: "Library",
      start: new Date("2026-09-01T18:00:00Z"),
      end: new Date("2026-09-01T19:00:00Z"),
    });
    expect(url).toContain("https://calendar.google.com/calendar/render?");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260901T180000Z%2F20260901T190000Z");
    expect(url).toContain("text=Study+Group");
    expect(url).toContain("location=Library");
  });

  it("synthesizes a +1h end when none is given (timed)", () => {
    const url = googleCalendarUrl({
      uid: "evt-2",
      title: "Quick Chat",
      start: new Date("2026-09-01T18:00:00Z"),
    });
    expect(url).toContain("dates=20260901T180000Z%2F20260901T190000Z");
  });

  it("uses date-only stamps for all-day events", () => {
    const url = googleCalendarUrl({
      uid: "ohs-1",
      title: "Spring Break",
      start: new Date("2027-03-22T00:00:00Z"),
      end: new Date("2027-03-27T00:00:00Z"),
      allDay: true,
    });
    expect(url).toContain("dates=20270322%2F20270327");
  });
});

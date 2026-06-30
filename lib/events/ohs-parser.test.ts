import { describe, it, expect } from "vitest";
import {
  parseOhsLine,
  parseOhsCalendar,
  extractLinesFromHtml,
  seedOhsEvents,
} from "./ohs-parser";

const YEAR = 2026;

describe("parseOhsLine", () => {
  it("parses a single-day event (Aug → start year)", () => {
    const ev = parseOhsLine("Wednesday, 8/19 — First Day of Class", YEAR);
    expect(ev).not.toBeNull();
    expect(ev!.title).toBe("First Day of Class");
    expect(ev!.startDate.toISOString().slice(0, 10)).toBe("2026-08-19");
    expect(ev!.endDate.toISOString().slice(0, 10)).toBe("2026-08-19");
    expect(ev!.externalKey).toBe("ohs:2026:2026-08-19:first-day-of-class");
  });

  it("parses a multi-day range with an en-dash", () => {
    const ev = parseOhsLine("Wednesday-Friday, 10/28–10/30 — Parent-Teacher Conferences", YEAR);
    expect(ev!.startDate.toISOString().slice(0, 10)).toBe("2026-10-28");
    expect(ev!.endDate.toISOString().slice(0, 10)).toBe("2026-10-30");
  });

  it("resolves Jan–Jul months to the next calendar year", () => {
    const ev = parseOhsLine("Monday, 1/11 — First Day of Spring Classes", YEAR);
    expect(ev!.startDate.toISOString().slice(0, 10)).toBe("2027-01-11");
  });

  it("handles spaced ranges like '8/3 – 8/9'", () => {
    const ev = parseOhsLine("Monday – Sunday, 8/3 – 8/9 — Summer Program", YEAR);
    expect(ev!.startDate.toISOString().slice(0, 10)).toBe("2026-08-03");
    expect(ev!.endDate.toISOString().slice(0, 10)).toBe("2026-08-09");
  });

  it("returns null for an undated (TBD) line", () => {
    expect(parseOhsLine("TBD — Pixel Festival", YEAR)).toBeNull();
  });

  it("returns null for a header / blank line", () => {
    expect(parseOhsLine("Fall Semester 2026", YEAR)).toBeNull();
    expect(parseOhsLine("   ", YEAR)).toBeNull();
  });

  it("returns null when there is a date but no title", () => {
    expect(parseOhsLine("Wednesday, 8/19", YEAR)).toBeNull();
  });
});

describe("parseOhsCalendar", () => {
  it("parses multiple lines, drops non-events, sorts by start, de-dups", () => {
    const text = [
      "Fall Semester 2026",
      "Wednesday, 8/19 — First Day of Class",
      "TBD — Pixel Festival",
      "Monday, 9/7 — Labor Day Holiday",
      "Wednesday, 8/19 — First Day of Class", // duplicate
    ].join("\n");
    const events = parseOhsCalendar(text, YEAR);
    expect(events).toHaveLength(2);
    expect(events[0].startDate.getTime()).toBeLessThan(events[1].startDate.getTime());
  });
});

describe("extractLinesFromHtml", () => {
  it("pulls date-bearing lines out of HTML list markup", () => {
    const html = `
      <h2>Fall Semester 2026</h2>
      <ul>
        <li>Wednesday, 8/19 &ndash; First Day of Class</li>
        <li>Monday, 9/7 &ndash; Labor Day Holiday</li>
        <li>No date here</li>
      </ul>`;
    const lines = extractLinesFromHtml(html);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("8/19");
    expect(lines[0]).toContain("First Day of Class");
    // The &ndash; entity decoded to an en-dash.
    expect(lines.join(" ")).toContain("–");
  });

  it("keeps a date <td> and title <td> on the same row", () => {
    const html =
      "<table><tr><td>8/19</td><td>First Day of Class</td></tr></table>";
    const lines = extractLinesFromHtml(html);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("8/19");
    expect(lines[0]).toContain("First Day of Class");
  });
});

describe("seedOhsEvents", () => {
  it("produces a non-empty, well-formed real school-year calendar", () => {
    const events = seedOhsEvents();
    expect(events.length).toBeGreaterThan(10);
    // First Day of Class is the earliest.
    expect(events[0].title).toBe("First Day of Class");
    expect(events[0].startDate.toISOString().slice(0, 10)).toBe("2026-08-19");
    // Every event has a stable key and end >= start.
    for (const ev of events) {
      expect(ev.externalKey).toMatch(/^ohs:2026:/);
      expect(ev.endDate.getTime()).toBeGreaterThanOrEqual(ev.startDate.getTime());
    }
  });
});

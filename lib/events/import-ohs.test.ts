import { describe, it, expect } from "vitest";
import { parseLiveHtml } from "./import-ohs";

// Note: importOhsCalendar() itself writes to the DB (upsertOhsEvents), so it's
// covered by integration/manual runs (scripts/import-ohs-events.ts). Here we test
// the pure live-HTML parse path that decides whether the live page yields events
// (and thus whether the importer uses 'live' vs the seed fallback).

describe("parseLiveHtml", () => {
  it("parses events out of realistic OHS gateway markup", () => {
    const html = `
      <main>
        <h2>Fall Semester 2026</h2>
        <table>
          <tr><td>Wednesday, 8/19</td><td>First Day of Class</td></tr>
          <tr><td>Monday, 9/7</td><td>Labor Day Holiday (no classes)</td></tr>
          <tr><td>Wednesday-Friday, 11/25&ndash;11/27</td><td>Thanksgiving Holiday</td></tr>
        </table>
        <h2>Spring Semester 2027</h2>
        <ul>
          <li>Monday, 1/11 &ndash; First Day of Spring Classes</li>
          <li>TBD &ndash; Pixel Festival</li>
        </ul>
      </main>`;
    const events = parseLiveHtml(html);
    const titles = events.map((e) => e.title);
    expect(titles).toContain("First Day of Class");
    expect(titles).toContain("Thanksgiving Holiday");
    expect(titles).toContain("First Day of Spring Classes");
    // TBD line has no date → dropped.
    expect(titles).not.toContain("Pixel Festival");
    // Spring months resolve to 2027.
    const spring = events.find((e) => e.title === "First Day of Spring Classes");
    expect(spring!.startDate.toISOString().slice(0, 10)).toBe("2027-01-11");
    // Multi-day range spans correctly.
    const thx = events.find((e) => e.title === "Thanksgiving Holiday");
    expect(thx!.startDate.toISOString().slice(0, 10)).toBe("2026-11-25");
    expect(thx!.endDate.toISOString().slice(0, 10)).toBe("2026-11-27");
  });

  it("returns an empty array for markup with no dated events (triggers seed fallback)", () => {
    const html = "<main><h2>Calendar coming soon</h2><p>Check back later.</p></main>";
    expect(parseLiveHtml(html)).toHaveLength(0);
  });
});

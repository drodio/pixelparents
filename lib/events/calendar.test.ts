import { describe, it, expect } from "vitest";
import {
  buildMonthGrid,
  eventOverlapsDay,
  splitUpcomingPast,
  eventsThisWeek,
  localDayKey,
  utcDayKey,
  type CalendarEvent,
} from "./calendar";

function ev(partial: Partial<CalendarEvent> & { id: string; startsAt: string }): CalendarEvent {
  return {
    title: "Event",
    description: null,
    endsAt: null,
    isOnline: false,
    allDay: false,
    location: null,
    onlineUrl: null,
    source: "user",
    authorLabel: null,
    goingCount: 0,
    interestedCount: 0,
    canEdit: false,
    myRsvp: null,
    ...partial,
  };
}

describe("localDayKey", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(localDayKey(new Date(2026, 8, 1))).toBe("2026-09-01");
  });
});

describe("utcDayKey", () => {
  it("reads a UTC-midnight instant back as its own calendar day", () => {
    // This is exactly how all-day events are stored (see ohs-parser utcDay).
    expect(utcDayKey(new Date(Date.UTC(2026, 7, 19)))).toBe("2026-08-19");
  });
});

// All-day placement/rendering must use the event's UTC calendar day, NOT the
// viewer's local day. These fixtures use Date.UTC(...) — the actual DB storage
// shape — so the west-of-UTC regression ("First Day of Class 8/19" landing on
// Aug 18) can't come back. Because the all-day path reads UTC getters, the
// assertions hold in EVERY timezone the suite runs under.
describe("all-day events (UTC-midnight storage)", () => {
  it("places a single-day all-day event on its stored UTC day, not one earlier", () => {
    const firstDay = ev({
      id: "ohs-first-day",
      title: "First Day of Class",
      allDay: true,
      source: "ohs",
      // 8/19 stored at UTC midnight (Date.UTC month is 0-based → 7).
      startsAt: new Date(Date.UTC(2026, 7, 19)).toISOString(),
      endsAt: new Date(Date.UTC(2026, 7, 19)).toISOString(),
    });
    // A local calendar cell for Aug 19 overlaps; Aug 18 does NOT.
    expect(eventOverlapsDay(firstDay, new Date(2026, 7, 19))).toBe(true);
    expect(eventOverlapsDay(firstDay, new Date(2026, 7, 18))).toBe(false);
    expect(eventOverlapsDay(firstDay, new Date(2026, 7, 20))).toBe(false);
  });

  it("spans a multi-day all-day range inclusively across its UTC days", () => {
    const conf = ev({
      id: "ptc",
      title: "Parent-Teacher Conferences",
      allDay: true,
      source: "ohs",
      startsAt: new Date(Date.UTC(2026, 9, 28)).toISOString(), // 10/28
      endsAt: new Date(Date.UTC(2026, 9, 30)).toISOString(), // 10/30 inclusive
    });
    expect(eventOverlapsDay(conf, new Date(2026, 9, 27))).toBe(false);
    expect(eventOverlapsDay(conf, new Date(2026, 9, 28))).toBe(true);
    expect(eventOverlapsDay(conf, new Date(2026, 9, 29))).toBe(true);
    expect(eventOverlapsDay(conf, new Date(2026, 9, 30))).toBe(true);
    expect(eventOverlapsDay(conf, new Date(2026, 9, 31))).toBe(false);
  });

  it("buckets a UTC-midnight all-day event onto the correct grid cell", () => {
    const firstDay = ev({
      id: "ohs-first-day",
      title: "First Day of Class",
      allDay: true,
      source: "ohs",
      startsAt: new Date(Date.UTC(2026, 7, 19)).toISOString(),
      endsAt: new Date(Date.UTC(2026, 7, 19)).toISOString(),
    });
    const grid = buildMonthGrid(new Date(2026, 7, 1), [firstDay], new Date(2026, 7, 1));
    const aug19 = grid.find((c) => localDayKey(c.date) === "2026-08-19");
    const aug18 = grid.find((c) => localDayKey(c.date) === "2026-08-18");
    expect(aug19?.events.map((e) => e.id)).toEqual(["ohs-first-day"]);
    expect(aug18?.events).toEqual([]);
  });
});

describe("eventOverlapsDay", () => {
  it("places a single-day event on its day", () => {
    const e = ev({ id: "a", startsAt: new Date(2026, 8, 1, 18).toISOString() });
    expect(eventOverlapsDay(e, new Date(2026, 8, 1))).toBe(true);
    expect(eventOverlapsDay(e, new Date(2026, 8, 2))).toBe(false);
  });

  it("spans a multi-day event across every overlapping day", () => {
    const e = ev({
      id: "b",
      startsAt: new Date(2026, 8, 1).toISOString(),
      endsAt: new Date(2026, 8, 3).toISOString(),
      allDay: true,
    });
    expect(eventOverlapsDay(e, new Date(2026, 8, 1))).toBe(true);
    expect(eventOverlapsDay(e, new Date(2026, 8, 2))).toBe(true);
    expect(eventOverlapsDay(e, new Date(2026, 8, 3))).toBe(true);
    expect(eventOverlapsDay(e, new Date(2026, 8, 4))).toBe(false);
  });
});

describe("buildMonthGrid", () => {
  it("produces a 42-cell grid starting on the week boundary", () => {
    // Sept 2026: the 1st is a Tuesday; the grid should start Sunday Aug 30.
    const grid = buildMonthGrid(new Date(2026, 8, 15), [], new Date(2026, 8, 15));
    expect(grid).toHaveLength(42);
    expect(localDayKey(grid[0].date)).toBe("2026-08-30");
    expect(grid[0].inMonth).toBe(false);
    // The 1st of the month should be in-month.
    const first = grid.find((c) => localDayKey(c.date) === "2026-09-01");
    expect(first?.inMonth).toBe(true);
  });

  it("marks today", () => {
    const grid = buildMonthGrid(new Date(2026, 8, 15), [], new Date(2026, 8, 15));
    const today = grid.find((c) => c.isToday);
    expect(today && localDayKey(today.date)).toBe("2026-09-15");
  });

  it("buckets events onto the right cells", () => {
    const e = ev({ id: "a", startsAt: new Date(2026, 8, 10, 12).toISOString() });
    const grid = buildMonthGrid(new Date(2026, 8, 1), [e], new Date(2026, 8, 1));
    const cell = grid.find((c) => localDayKey(c.date) === "2026-09-10");
    expect(cell?.events.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("splitUpcomingPast", () => {
  it("splits on now, sorting upcoming asc + past desc", () => {
    const now = new Date(2026, 8, 15);
    const past = ev({ id: "p", startsAt: new Date(2026, 8, 1).toISOString() });
    const soon = ev({ id: "s", startsAt: new Date(2026, 8, 20).toISOString() });
    const later = ev({ id: "l", startsAt: new Date(2026, 8, 25).toISOString() });
    const { upcoming, past: pastList } = splitUpcomingPast([later, past, soon], now);
    expect(upcoming.map((x) => x.id)).toEqual(["s", "l"]);
    expect(pastList.map((x) => x.id)).toEqual(["p"]);
  });

  it("uses end (not start) to decide past for ranged events", () => {
    const now = new Date(2026, 8, 15, 12);
    const ongoing = ev({
      id: "o",
      startsAt: new Date(2026, 8, 14).toISOString(),
      endsAt: new Date(2026, 8, 16).toISOString(),
    });
    const { upcoming } = splitUpcomingPast([ongoing], now);
    expect(upcoming.map((x) => x.id)).toEqual(["o"]);
  });
});

describe("eventsThisWeek", () => {
  it("returns events within the next 7 days", () => {
    const now = new Date(2026, 8, 15);
    const inWindow = ev({ id: "a", startsAt: new Date(2026, 8, 18).toISOString() });
    const outWindow = ev({ id: "b", startsAt: new Date(2026, 8, 30).toISOString() });
    const result = eventsThisWeek([inWindow, outWindow], now);
    expect(result.map((x) => x.id)).toEqual(["a"]);
  });
});

// PURE, DB-free helpers that turn a flat list of events into a month-grid + the
// list views the calendar UI renders. Shared by the client component and the unit
// tests.
//
// TIMEZONE MODEL (must stay coherent with the display components + .ics export):
//   - TIMED events are stored as real UTC instants and placed/rendered in the
//     VIEWER's local time (a 6pm meeting shows at the viewer's 6pm).
//   - ALL-DAY events (every OHS school-year date + user all-day events) are stored
//     at UTC midnight of the calendar day the user meant. They must be read back by
//     their UTC calendar day (UTC getters), NOT the viewer's local day — otherwise
//     a date stored as 2026-08-19T00:00:00Z renders as Aug 18 for any viewer west
//     of UTC (all of the US). So all-day placement/comparison uses utcDayKey.
//   - "today" / the current month are computed from the viewer's LOCAL time.

export type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  // ISO instant strings (UTC) — parsed to Date for placement.
  startsAt: string;
  endsAt: string | null;
  isOnline: boolean;
  allDay: boolean;
  location: string | null;
  onlineUrl: string | null;
  source: "user" | "ohs";
  authorLabel: string | null;
  goingCount: number;
  interestedCount: number;
  // Whether the current viewer can edit this event (author or admin, never OHS).
  canEdit: boolean;
  // The viewer's own RSVP, if any.
  myRsvp: "going" | "interested" | null;
};

export type DayCell = {
  // Local calendar date this cell represents.
  date: Date;
  inMonth: boolean;
  isToday: boolean;
  // Events overlapping this day, sorted (all-day/multi-day first, then by start).
  events: CalendarEvent[];
};

// A local YYYY-MM-DD key for a Date (viewer-local, not UTC) — used to bucket
// TIMED events + day cells onto days without timezone drift.
export function localDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// A UTC YYYY-MM-DD key for a Date — used to bucket ALL-DAY events, which are
// stored at UTC midnight of the calendar day the user picked. Reading them with
// UTC getters means the stored calendar day renders back as itself in every zone.
export function utcDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

// Midnight (local) at the start of the given day.
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// True if an event overlaps the calendar day `day`.
//
// For ALL-DAY events we compare by UTC calendar day: the event covers every day
// from its UTC start-day through its (inclusive) UTC end-day, and `day`'s calendar
// date (its Y/M/D as shown in the grid) is checked against that inclusive range.
// For TIMED events we keep the local midnight→midnight instant overlap.
export function eventOverlapsDay(ev: CalendarEvent, day: Date): boolean {
  if (ev.allDay) {
    // The grid cell represents a calendar date; its Y/M/D is its local key.
    const cellKey = localDayKey(day);
    const startKey = utcDayKey(new Date(ev.startsAt));
    const endKey = ev.endsAt ? utcDayKey(new Date(ev.endsAt)) : startKey;
    return cellKey >= startKey && cellKey <= endKey;
  }
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const start = new Date(ev.startsAt).getTime();
  // For an event with no end, treat it as instantaneous (placed on its start day).
  const end = ev.endsAt ? new Date(ev.endsAt).getTime() : start;
  // Overlap if [start, end] intersects [dayStart, dayEnd).
  return start < dayEnd && end >= dayStart;
}

// Sort key within a day: multi-day / all-day events bubble to the top, then by
// start instant, then title.
function dayEventSort(a: CalendarEvent, b: CalendarEvent): number {
  const aMulti = a.allDay || Boolean(a.endsAt);
  const bMulti = b.allDay || Boolean(b.endsAt);
  if (aMulti !== bMulti) return aMulti ? -1 : 1;
  const at = new Date(a.startsAt).getTime();
  const bt = new Date(b.startsAt).getTime();
  if (at !== bt) return at - bt;
  return a.title.localeCompare(b.title);
}

// Build the 6-row (42-cell) grid for the month containing `monthAnchor`. The grid
// starts on the Sunday on/before the 1st and runs 42 days so every month fits a
// stable 6×7 layout. `weekStartsOn` defaults to 0 (Sunday).
export function buildMonthGrid(
  monthAnchor: Date,
  events: CalendarEvent[],
  now: Date = new Date(),
  weekStartsOn = 0,
): DayCell[] {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const first = new Date(year, month, 1);

  // Back up to the start-of-week before (or on) the 1st.
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const gridStart = new Date(year, month, 1 - lead);

  const todayKey = localDayKey(now);

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const dayEvents = events.filter((ev) => eventOverlapsDay(ev, date)).sort(dayEventSort);
    cells.push({
      date,
      inMonth: date.getMonth() === month,
      isToday: localDayKey(date) === todayKey,
      events: dayEvents,
    });
  }
  return cells;
}

// Is an ALL-DAY event still upcoming (or ongoing) relative to `now`?
//
// All-day events are stored at UTC midnight of the calendar day the user meant,
// so their raw instant is already "past" for most of the local day in any zone
// west of UTC — comparing .getTime() to now wrongly buckets a today-dated all-day
// event as past. Instead compare CALENDAR DAYS: the event's inclusive UTC end-day
// (or start-day if there's no end) against today's LOCAL day key. It's upcoming
// while that end-day is >= today.
function allDayNotPast(ev: CalendarEvent, now: Date): boolean {
  const todayKey = localDayKey(now);
  const startKey = utcDayKey(new Date(ev.startsAt));
  const endKey = ev.endsAt ? utcDayKey(new Date(ev.endsAt)) : startKey;
  return endKey >= todayKey;
}

// Partition events into upcoming (end/start >= now) and past, each sorted. An
// event with an end uses its end to decide "past"; otherwise its start. All-day
// events are classified by their UTC calendar day vs today's local day (see
// allDayNotPast) so a today-dated all-day event doesn't fall into Past.
export function splitUpcomingPast(
  events: CalendarEvent[],
  now: Date = new Date(),
): { upcoming: CalendarEvent[]; past: CalendarEvent[] } {
  const nowMs = now.getTime();
  const upcoming: CalendarEvent[] = [];
  const past: CalendarEvent[] = [];
  for (const ev of events) {
    const notPast = ev.allDay
      ? allDayNotPast(ev, now)
      : (ev.endsAt ? new Date(ev.endsAt).getTime() : new Date(ev.startsAt).getTime()) >= nowMs;
    if (notPast) upcoming.push(ev);
    else past.push(ev);
  }
  upcoming.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  past.sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
  return { upcoming, past };
}

// Events that overlap the next 7 days (inclusive of today) — drives the
// "happening this week" highlight strip. Timed events use their instant overlap
// against the local [today, +7d) window; all-day events use a UTC calendar-day
// overlap against the same window's day keys so a today-dated all-day event isn't
// dropped for viewers west of UTC.
export function eventsThisWeek(
  events: CalendarEvent[],
  now: Date = new Date(),
): CalendarEvent[] {
  const start = startOfDay(now).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  const todayKey = localDayKey(now);
  // Local day key of the last day (inclusive) in the 7-day window.
  const lastDayKey = localDayKey(new Date(start + 6 * 24 * 60 * 60 * 1000));
  return events
    .filter((ev) => {
      if (ev.allDay) {
        const startKey = utcDayKey(new Date(ev.startsAt));
        const endKey = ev.endsAt ? utcDayKey(new Date(ev.endsAt)) : startKey;
        // The event's inclusive UTC day range overlaps [today, +6d].
        return startKey <= lastDayKey && endKey >= todayKey;
      }
      const s = new Date(ev.startsAt).getTime();
      const e = ev.endsAt ? new Date(ev.endsAt).getTime() : s;
      // Overlaps the [today, +7d) window.
      return s < end && e >= start;
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

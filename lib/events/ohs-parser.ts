// Parser for the Stanford OHS school-year calendar.
//
// INVESTIGATION RESULT: the gateway page
// (https://onlinehighschool.stanford.edu/school-year-calendar-gateway) does NOT
// expose an iCal/.ics feed, a Google Calendar embed, or any structured/JSON
// calendar. It renders the school-year calendar as plain HTML — rows of a date
// (or date range) followed by an event title, grouped by semester. So we parse
// that HTML structure directly, and ship a CURATED SEED fallback (the same events,
// hand-transcribed) so the importer still produces a correct calendar even if the
// page is unreachable or its markup shifts. We never invent events.
//
// Date formats observed on the page (all month/day, academic year spans Aug→Jun):
//   "Wednesday, 8/19"                    → single day
//   "Wednesday-Friday, 10/28–10/30"      → multi-day range (en-dash or hyphen)
//   "Monday – Sunday, 8/3 – 8/9"         → range with spaces
//   "TBD"                                → undated (skipped — no date to place it)
//
// This module is PURE + DB-free so the server importer and the unit tests share
// it. It returns normalized ParsedOhsEvent rows; the importer maps them to the
// `events` table (source='ohs', allDay=true, not editable).

export type ParsedOhsEvent = {
  // A stable de-dup key: `ohs:<academicYearStart>:<startISODate>:<slug(title)>`.
  // The importer upserts on this so re-running never duplicates.
  externalKey: string;
  title: string;
  // Inclusive first day (UTC midnight) and inclusive last day (UTC midnight).
  // For a single-day event startDate === endDate.
  startDate: Date;
  endDate: Date;
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

// A UTC-midnight Date for a given calendar y/m/d (month is 1-based).
function utcDay(year: number, month1: number, day: number): Date {
  return new Date(Date.UTC(year, month1 - 1, day));
}

// OHS academic years run Aug→Jun. Given the academic year's START calendar year
// and a month, resolve the actual calendar year: months Aug–Dec (>=7, 0-based 7)
// belong to the start year; Jan–Jul belong to the next year.
function calendarYearFor(month1: number, academicYearStart: number): number {
  return month1 >= 8 ? academicYearStart : academicYearStart + 1;
}

// Parse a single "M/D" token into { month, day }, or null.
function parseMd(token: string): { month: number; day: number } | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(token.trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

// Split a date phrase (the part before the comma's title) into its M/D tokens.
// Handles "8/19", "10/28–10/30", "8/3 – 8/9". Returns 1 or 2 tokens.
function splitDateTokens(datePart: string): string[] {
  // Normalize all dash variants (en/em/hyphen) to a plain hyphen, then split.
  const norm = datePart.replace(/[–—]/g, "-");
  // Keep only the M/D tokens (drop weekday words). Match all M/D occurrences.
  const found = norm.match(/\d{1,2}\/\d{1,2}/g);
  return found ?? [];
}

// Parse ONE calendar line of the form "<weekday(s)>, <M/D[ - M/D]> — <title>" or
// "<M/D> <title>". Returns a ParsedOhsEvent, or null when the line carries no
// usable date (e.g. "TBD") or no title.
export function parseOhsLine(
  rawLine: string,
  academicYearStart: number,
): ParsedOhsEvent | null {
  const line = rawLine.replace(/\s+/g, " ").trim();
  if (!line) return null;

  // Find the M/D tokens anywhere in the line; everything after the LAST date
  // token (or after a comma/dash separator) is the title.
  const tokens = splitDateTokens(line);
  if (tokens.length === 0) return null; // "TBD" or undated → skip

  const first = parseMd(tokens[0]);
  if (!first) return null;
  const second = tokens[1] ? parseMd(tokens[1]) : null;

  // The title is the text after the last date token. Locate it by stripping the
  // recognized date phrase from the front portion.
  const lastTok = tokens[tokens.length - 1].replace(/[–—]/g, "-");
  const idx = line.replace(/[–—]/g, "-").lastIndexOf(lastTok);
  let title = idx >= 0 ? line.slice(idx + lastTok.length) : line;
  // Strip a leading separator (— , : - or whitespace) and surrounding quotes.
  title = title.replace(/^[\s—–\-,:"'()]+/, "").replace(/["']+$/, "").trim();
  // Some sources wrap the title in quotes or trailing parenthetical — keep as-is
  // beyond the leading strip; just collapse whitespace.
  title = title.replace(/\s+/g, " ").trim();
  if (!title) return null;

  const startYear = calendarYearFor(first.month, academicYearStart);
  const startDate = utcDay(startYear, first.month, first.day);

  let endDate = startDate;
  if (second) {
    const endYear = calendarYearFor(second.month, academicYearStart);
    let candidate = utcDay(endYear, second.month, second.day);
    // Guard against a backwards range (shouldn't happen, but be safe).
    if (candidate.getTime() < startDate.getTime()) candidate = startDate;
    endDate = candidate;
  }

  const startISO = startDate.toISOString().slice(0, 10);
  const externalKey = `ohs:${academicYearStart}:${startISO}:${slugify(title)}`;

  return { externalKey, title, startDate, endDate };
}

// Parse the full calendar text (one event per non-empty line). Lines that aren't
// dated events (headers like "Fall Semester 2026", blank lines, "TBD" rows) are
// silently dropped. De-dups by externalKey (last wins).
export function parseOhsCalendar(
  text: string,
  academicYearStart: number,
): ParsedOhsEvent[] {
  const byKey = new Map<string, ParsedOhsEvent>();
  for (const line of text.split(/\r?\n/)) {
    const ev = parseOhsLine(line, academicYearStart);
    if (ev) byKey.set(ev.externalKey, ev);
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.startDate.getTime() - b.startDate.getTime(),
  );
}

// Extract candidate calendar lines from the page HTML. The OHS page lists each
// event as a date + title within a list item / table row / paragraph. We strip
// tags to text, then split into lines on block boundaries, keeping only lines
// that contain an "M/D" date token (which parseOhsLine re-validates).
export function extractLinesFromHtml(html: string): string[] {
  // Insert newlines at common block boundaries so inline date+title pairs that
  // sit in separate cells/items become separate lines.
  const withBreaks = html
    .replace(/<\s*(li|tr|p|br|div|h[1-6])[^>]*>/gi, "\n")
    .replace(/<\/\s*(li|tr|p|div|h[1-6])\s*>/gi, "\n")
    .replace(/<\/\s*td\s*>/gi, " ") // keep date + title (separate <td>s) together
    .replace(/<[^>]+>/g, " ");
  // Decode the handful of entities the page uses.
  const decoded = withBreaks
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return decoded
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => /\d{1,2}\/\d{1,2}/.test(l));
}

// CURATED SEED — the OHS school-year calendar transcribed from the gateway page,
// used as the fallback when the live page can't be fetched or parsed. Lines are in
// the SAME shape parseOhsLine accepts, so the importer runs the identical parse
// path over them. Keep this updated as the school year rolls over.
//
// (No PII; these are public school dates.)
export const OHS_SEED_ACADEMIC_YEAR_START = 2026;
export const OHS_SEED_LINES: string[] = [
  "Wednesday, 8/19 — First Day of Class",
  "Monday, 9/7 — Labor Day Holiday (no classes)",
  "Friday, 9/18 — Back to School Night",
  "Wednesday-Friday, 10/28–10/30 — Parent-Teacher Conferences (no classes)",
  "Friday-Saturday, 11/20-11/21 — Homecoming",
  "Wednesday-Friday, 11/25–11/27 — Thanksgiving Holiday",
  "Monday-Tuesday, 12/7–12/8 — Review/Last Day of Classes",
  "Wednesday-Friday, 12/9–12/11 — Study Days (no classes)",
  "Monday-Saturday, 12/14–12/19 — Fall Semester Finals",
  "Saturday-Thursday, 12/19–12/31 — Winter Break",
  "Monday-Friday, 1/4 – 1/8 — Reading Week",
  "Monday, 1/11 — First Day of Spring Classes",
  "Monday, 1/18 — Martin Luther King Jr. Holiday (no classes)",
  "Monday, 2/15 — Presidents' Day Holiday (no classes)",
  "Monday-Friday, 3/22 – 3/26 — Spring Break",
  "Wednesday-Thursday, 5/12 – 5/13 — Review/Last Day of Classes",
  "Monday-Tuesday, 5/17 – 5/18 — Study Days",
  "Wednesday-Friday, 5/19 – 5/21 — Spring Semester Finals",
  "Monday-Wednesday, 5/24 – 5/26 — Spring Semester Finals",
  "Monday, 5/31 — Memorial Day Holiday",
  "Friday-Sunday, 6/4 – 6/6 — Pixel Gathering & Graduation Weekend",
];

export function seedOhsEvents(): ParsedOhsEvent[] {
  return parseOhsCalendar(OHS_SEED_LINES.join("\n"), OHS_SEED_ACADEMIC_YEAR_START);
}

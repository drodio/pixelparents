import {
  extractLinesFromHtml,
  parseOhsCalendar,
  seedOhsEvents,
  type ParsedOhsEvent,
} from "@/lib/events/ohs-parser";
import { upsertOhsEvents, type OhsUpsert } from "@/lib/db/events";

// Orchestrates the OHS school-year calendar import. Tries the live gateway page
// first; if the fetch fails OR yields no parseable events, falls back to the
// curated seed (so the calendar is always populated with real school dates). Pure
// of any auth — the route handler / script guards access. Returns a small report
// so the caller can log what happened (live vs seed, how many).

export const OHS_CALENDAR_URL =
  "https://onlinehighschool.stanford.edu/school-year-calendar-gateway";

// The academic year the live page currently covers. Used when parsing the live
// HTML (month→year resolution). Keep in step with the page each August.
export const OHS_LIVE_ACADEMIC_YEAR_START = 2026;

export type OhsImportResult = {
  source: "live" | "seed";
  parsed: number;
  upserted: number;
};

// Convert parsed events to DB upsert rows. We store the INCLUSIVE last day as the
// end (start of that day). The calendar's overlap math treats end>=dayStart as
// "on that day", so a 8/19–8/19 single-day event sets endsAt = startsAt and a
// multi-day range spans every day through its last.
function toUpserts(parsed: ParsedOhsEvent[]): OhsUpsert[] {
  return parsed.map((p) => ({
    externalKey: p.externalKey,
    title: p.title,
    startsAt: p.startDate,
    endsAt: p.endDate,
  }));
}

// Parse the live page text into events. Exposed for testing the HTML path.
export function parseLiveHtml(html: string): ParsedOhsEvent[] {
  const lines = extractLinesFromHtml(html);
  return parseOhsCalendar(lines.join("\n"), OHS_LIVE_ACADEMIC_YEAR_START);
}

// Fetch + import. `fetchImpl` is injectable for tests (defaults to global fetch).
export async function importOhsCalendar(
  fetchImpl: typeof fetch = fetch,
): Promise<OhsImportResult> {
  let parsed: ParsedOhsEvent[] = [];
  let usedSource: "live" | "seed" = "seed";

  try {
    const res = await fetchImpl(OHS_CALENDAR_URL, {
      headers: { "user-agent": "PixelParents-EventsBot/1.0 (+https://pixelparents.org)" },
      // Don't let a slow page hang the cron; the seed fallback covers a failure.
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const html = await res.text();
      const live = parseLiveHtml(html);
      if (live.length > 0) {
        parsed = live;
        usedSource = "live";
      }
    }
  } catch {
    // Swallow — fall through to the seed below.
  }

  if (parsed.length === 0) {
    parsed = seedOhsEvents();
    usedSource = "seed";
  }

  const upserted = await upsertOhsEvents(toUpserts(parsed));
  return { source: usedSource, parsed: parsed.length, upserted };
}

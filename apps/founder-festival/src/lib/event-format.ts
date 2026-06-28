// Event dates are stored as UTC instants (events.starts_at, timestamptz). When
// formatted on the server (Vercel runs in UTC), toLocale*() with no timeZone
// renders in UTC — so an evening Pacific event (e.g. June 1 ~7pm PT = June 2
// UTC) shows the WRONG calendar day. The festival runs on Pacific time, so we
// pin all event date/time display to America/Los_Angeles.
//
// If events ever span multiple regions, give the events table its own timezone
// column and thread it through here instead of the constant.

export const EVENT_TZ = "America/Los_Angeles";

// "Jun 1, 2026" — the calendar date in the festival's timezone.
export function formatEventDate(d: Date): string {
  return d.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: EVENT_TZ });
}

// "Monday, June 1, 2026" — long date, for the public event header.
export function formatEventDateLong(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: EVENT_TZ,
  });
}

// "Mon, Jun 1, 2026, 7:00 PM PT" — date + time, in the festival's timezone.
export function formatEventDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: EVENT_TZ,
    timeZoneName: "short",
  });
}

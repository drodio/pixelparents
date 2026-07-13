// A small, dependency-free RFC 5545 (iCalendar) generator + a Google Calendar
// "add to calendar" link builder. Pure + client-safe so the same code can build
// the .ics download in a route handler AND the Google link in the browser, and so
// the unit tests can assert the exact output byte-for-byte.
//
// We implement only the subset we need (a single VEVENT in a VCALENDAR) but we do
// it correctly: CRLF line endings, property-value escaping, ~75-octet line
// folding, and DATE vs DATE-TIME (UTC) value encoding for all-day vs timed events.
// Built fresh against the spec, not copied from any library.

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  // Online meeting link — appended to the description + emitted as a URL property.
  url?: string | null;
  start: Date;
  // Optional end. For an all-day event this is the EXCLUSIVE end day per RFC 5545
  // (DTEND is the day after the last day); the caller passes the exclusive value.
  end?: Date | null;
  allDay?: boolean;
  // Stamp used for DTSTAMP + as the change marker; defaults to `start`.
  createdAt?: Date;
};

// Escape a TEXT value per RFC 5545 §3.3.11: backslash, semicolon, comma, and
// newline are escaped. (Colons inside TEXT do not need escaping.)
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Fold a single content line to <=75 octets per RFC 5545 §3.1, continuing with a
// CRLF + single space. We fold on a character basis using the UTF-8 byte length so
// multibyte characters are never split across a fold boundary mid-codepoint.
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Continuation lines may use up to 75 octets too; the leading space counts, so
  // a continuation carries up to 74 octets of payload.
  let limit = 75;
  for (const ch of line) {
    const chBytes = enc.encode(ch).length;
    if (currentBytes + chBytes > limit) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
      limit = 74; // subsequent lines are prefixed with a space
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}

// Format a Date as a UTC DATE-TIME: YYYYMMDDTHHMMSSZ.
export function formatUtcStamp(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

// Format a Date as a DATE value: YYYYMMDD (UTC calendar date).
export function formatUtcDate(d: Date): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getUTCFullYear(), 4)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}

// Build the full VCALENDAR text for one event. Returns a CRLF-delimited string
// suitable for an .ics download (Content-Type text/calendar).
export function buildIcs(ev: IcsEvent): string {
  const stamp = ev.createdAt ?? ev.start;
  const lines: string[] = [];
  const push = (l: string) => lines.push(foldLine(l));

  push("BEGIN:VCALENDAR");
  push("VERSION:2.0");
  push("PRODID:-//GoPixel//Events//EN");
  push("CALSCALE:GREGORIAN");
  push("METHOD:PUBLISH");
  push("BEGIN:VEVENT");
  push(`UID:${escapeIcsText(ev.uid)}`);
  push(`DTSTAMP:${formatUtcStamp(stamp)}`);

  if (ev.allDay) {
    push(`DTSTART;VALUE=DATE:${formatUtcDate(ev.start)}`);
    if (ev.end) push(`DTEND;VALUE=DATE:${formatUtcDate(ev.end)}`);
  } else {
    push(`DTSTART:${formatUtcStamp(ev.start)}`);
    if (ev.end) push(`DTEND:${formatUtcStamp(ev.end)}`);
  }

  push(`SUMMARY:${escapeIcsText(ev.title)}`);

  // Compose the description: the body, plus the join link on its own line when
  // it's an online event (so the link survives even in clients that ignore URL).
  const descParts: string[] = [];
  if (ev.description) descParts.push(ev.description);
  if (ev.url) descParts.push(`Join: ${ev.url}`);
  if (descParts.length > 0) {
    push(`DESCRIPTION:${escapeIcsText(descParts.join("\n\n"))}`);
  }

  if (ev.location) push(`LOCATION:${escapeIcsText(ev.location)}`);
  if (ev.url) push(`URL:${escapeIcsText(ev.url)}`);

  push("END:VEVENT");
  push("END:VCALENDAR");

  return lines.join("\r\n") + "\r\n";
}

// Format a Date for a Google Calendar template link: YYYYMMDDTHHMMSSZ (timed) or
// YYYYMMDD (all-day). Google's render endpoint uses the same compact forms.
function googleStamp(d: Date, allDay: boolean): string {
  return allDay ? formatUtcDate(d) : formatUtcStamp(d);
}

// Build a Google Calendar "add event" URL. For an all-day event Google expects an
// EXCLUSIVE end date (day after); the caller passes the same exclusive `end` it
// gives buildIcs. When no end is provided we synthesize one (+1h timed / +1 day
// all-day) since Google requires a dates range.
export function googleCalendarUrl(ev: IcsEvent): string {
  const start = ev.start;
  let end = ev.end ?? null;
  if (!end) {
    end = ev.allDay
      ? new Date(start.getTime() + 24 * 60 * 60 * 1000)
      : new Date(start.getTime() + 60 * 60 * 1000);
  }

  const dates = `${googleStamp(start, Boolean(ev.allDay))}/${googleStamp(end, Boolean(ev.allDay))}`;

  const details: string[] = [];
  if (ev.description) details.push(ev.description);
  if (ev.url) details.push(`Join: ${ev.url}`);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates,
  });
  if (details.length > 0) params.set("details", details.join("\n\n"));
  if (ev.location) params.set("location", ev.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

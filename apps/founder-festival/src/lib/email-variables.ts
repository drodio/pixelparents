// The variable ("pill") engine for the event email composer. Pure + unit-tested:
// a static catalog, an HTML→text stripper, per-recipient value assembly, and the
// template renderer that the live preview AND the real send both call, so what
// the admin previews is exactly what ships.

export type VariableKey =
  | "nickname"
  | "first-name"
  | "last-name"
  | "full-name"
  | "profile-url"
  | "company-name"
  | "personalized-learnings"
  | "recommended-connections"
  | "event-name"
  | "event-description"
  | "event-url"
  | "event-date"
  | "venue"
  | "attendee-count";

export type VariableGroup = "attendee" | "event";

export type VariableDef = {
  key: VariableKey;
  label: string;
  group: VariableGroup;
  // Whether a per-pill "max characters" cap is offered (values that can run long).
  canTruncate: boolean;
  // Whether a per-pill date-format picker is offered (event-date only).
  canFormat?: boolean;
};

export const EMAIL_VARIABLES: VariableDef[] = [
  { key: "nickname", label: "Nickname (First name fallback)", group: "attendee", canTruncate: false },
  { key: "first-name", label: "First name", group: "attendee", canTruncate: false },
  { key: "last-name", label: "Last name", group: "attendee", canTruncate: false },
  { key: "full-name", label: "Full name", group: "attendee", canTruncate: false },
  { key: "profile-url", label: "Recipient's Festival profile URL", group: "attendee", canTruncate: false },
  { key: "company-name", label: "Company", group: "attendee", canTruncate: false },
  { key: "personalized-learnings", label: "Personalized learnings", group: "attendee", canTruncate: true },
  { key: "recommended-connections", label: "Attendee insights", group: "attendee", canTruncate: true },
  { key: "event-name", label: "Event name", group: "event", canTruncate: false },
  { key: "event-description", label: "Event description", group: "event", canTruncate: true },
  { key: "event-url", label: "Event URL", group: "event", canTruncate: false },
  { key: "event-date", label: "Event date", group: "event", canTruncate: false, canFormat: true },
  { key: "venue", label: "Venue", group: "event", canTruncate: false },
  { key: "attendee-count", label: "Attendee count", group: "event", canTruncate: false },
];

// Selectable display formats for the event-date pill (all date-only, no time).
// The `id` is what's serialized into the marker (`{{event-date:fmt=<id>}}`).
export type EventDateFormat = "weekday" | "monthday" | "numeric";

export const EVENT_DATE_FORMATS: ReadonlyArray<{ id: EventDateFormat; label: string; example: string }> = [
  { id: "weekday", label: "Weekday, Month Day", example: "Monday, June 1st" },
  { id: "monthday", label: "Month Day", example: "June 1st" },
  { id: "numeric", label: "Numeric", example: "6/1/26" },
];

export const DEFAULT_EVENT_DATE_FORMAT: EventDateFormat = "weekday";

export function isEventDateFormat(s: string): s is EventDateFormat {
  return EVENT_DATE_FORMATS.some((f) => f.id === s);
}

const VARIABLE_KEYS = new Set<string>(EMAIL_VARIABLES.map((v) => v.key));

export function isVariableKey(s: string): s is VariableKey {
  return VARIABLE_KEYS.has(s);
}

export function variableLabel(key: string): string {
  return EMAIL_VARIABLES.find((v) => v.key === key)?.label ?? key;
}

// Strip TipTap/admin HTML down to readable plain text (these emails are plain
// text for now). Blocks become newlines; entities are decoded; runs of blank
// lines collapse.
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Marker format inside subject/body templates: `{{key}}`, `{{key:max=500}}`, or
// `{{event-date:fmt=weekday}}`. Substitutes resolved per-recipient values;
// unknown/empty keys → "". A `:max=N` cap truncates long values with an ellipsis.
// A `:fmt=<id>` modifier (event-date only) re-formats from the raw start date —
// so `opts.eventStartsAt` must be supplied for the format to apply (else it falls
// back to the default-formatted value in `values`).
// Escape a substituted value for safe insertion into HTML (text or attribute
// context). Used when rendering the rich HTML body so a recipient's name/company/
// URL can't break the surrounding markup or inject tags. Subject + legacy
// plain-text bodies don't pass `escapeValues` (the plain-text path escapes the
// whole body downstream instead).
function escapeValue(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTemplate(
  template: string,
  values: Partial<Record<VariableKey, string>>,
  opts?: { eventStartsAt?: Date | null; escapeValues?: boolean },
): string {
  const esc = opts?.escapeValues ? escapeValue : (s: string) => s;
  return template.replace(
    /\{\{\s*([a-z][a-z-]*)\s*(?::max=(\d+)|:fmt=([a-z0-9]+))?\s*\}\}/gi,
    (_match, rawKey: string, rawMax: string | undefined, rawFmt: string | undefined) => {
      const key = rawKey.toLowerCase();
      if (!isVariableKey(key)) return ""; // unknown variable → drop
      // event-date format modifier — compute from the raw start date on demand.
      if (key === "event-date" && rawFmt && isEventDateFormat(rawFmt.toLowerCase()) && opts?.eventStartsAt) {
        return esc(formatEventDate(opts.eventStartsAt, rawFmt.toLowerCase() as EventDateFormat));
      }
      let v = values[key] ?? "";
      if (rawMax) {
        const n = parseInt(rawMax, 10);
        if (Number.isFinite(n) && n > 0 && v.length > n) {
          v = v.slice(0, n).replace(/\s+$/, "") + "…";
        }
      }
      return esc(v);
    },
  );
}

// 1 → "1st", 2 → "2nd", 22 → "22nd", 11 → "11th", etc.
function ordinalDay(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

// Event start formatted in Pacific time, DATE ONLY (no time). Formats:
//   weekday  → "Monday, June 1st"   (default)
//   monthday → "June 1st"
//   numeric  → "6/1/26"
export function formatEventDate(startsAt: Date, fmt: EventDateFormat = DEFAULT_EVENT_DATE_FORMAT): string {
  const timeZone = "America/Los_Angeles";
  if (fmt === "numeric") {
    return startsAt.toLocaleDateString("en-US", { timeZone, month: "numeric", day: "numeric", year: "2-digit" });
  }
  // Derive the Pacific calendar day for the ordinal, plus month / weekday names.
  const day = Number(startsAt.toLocaleDateString("en-US", { timeZone, day: "numeric" }));
  const month = startsAt.toLocaleDateString("en-US", { timeZone, month: "long" });
  if (fmt === "monthday") return `${month} ${ordinalDay(day)}`;
  const weekday = startsAt.toLocaleDateString("en-US", { timeZone, weekday: "long" });
  return `${weekday}, ${month} ${ordinalDay(day)}`;
}

export type AttendeeForVars = {
  fullName: string | null;
  // The attendee's chosen nickname (claimed profiles only); null when unset. The
  // {{nickname}} variable falls back to the first name when this is blank.
  nickname: string | null;
  // Site-relative profile path (e.g. "/profile/jane") or null when unmatched.
  profileHref: string | null;
  companyName: string | null;
};

export type EventForVars = {
  title: string;
  descriptionHtml: string | null;
  slug: string;
  startsAt: Date;
  venue: string | null;
  attendeeCount: number;
};

// Pure assembly of one recipient's variable values. Profile URL falls back to
// the home page with find open ("/?find=1") for attendees without a profile.
export function buildRecipientValues(opts: {
  attendee: AttendeeForVars;
  event: EventForVars;
  personalizedHtml: string | null;
  connectionsHtml?: string | null;
  baseUrl: string;
}): Record<VariableKey, string> {
  const { attendee, event, personalizedHtml, connectionsHtml = null } = opts;
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");
  const parts = (attendee.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : "";
  // {{nickname}} = the chosen nickname when set, else the first name.
  const nickname = (attendee.nickname ?? "").trim() || firstName;
  const profileUrl = attendee.profileHref ? `${baseUrl}${attendee.profileHref}` : `${baseUrl}/?find=1`;
  return {
    nickname,
    "first-name": firstName,
    "last-name": lastName,
    "full-name": attendee.fullName ?? "",
    "profile-url": profileUrl,
    "company-name": attendee.companyName ?? "",
    "personalized-learnings": htmlToText(personalizedHtml),
    "recommended-connections": htmlToText(connectionsHtml),
    "event-name": event.title,
    "event-description": htmlToText(event.descriptionHtml),
    "event-url": `${baseUrl}/events/${event.slug}`,
    "event-date": formatEventDate(event.startsAt),
    venue: event.venue ?? "",
    "attendee-count": String(event.attendeeCount),
  };
}

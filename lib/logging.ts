// Pure helpers for the audit log: redaction, truncation, and shaping.
//
// Kept free of DB/Next imports so they can be unit-tested directly — the
// redaction rules in particular are the sort of thing that must not silently
// regress, since this table holds real families' data.

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

// How long entries are kept. Short on purpose: this is a debugging aid, not an
// archive, and it bounds how much personal data we're sitting on.
export const LOG_RETENTION_DAYS = 14;

// Keys whose VALUES must never be written, no matter how deep they're nested.
// Matched case-insensitively as substrings, so "clerkSecretKey", "api_token",
// and "authorization" are all covered.
const SECRET_KEY_HINTS = [
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "session_token",
  "credential",
  "private",
  "signature",
];

// Values longer than this are clipped so one huge payload can't bloat the table.
const MAX_STRING = 2_000;
const MAX_DEPTH = 6;
// Total serialized size guard for a single context blob.
const MAX_CONTEXT_BYTES = 16_000;

function isSecretKey(key: string): boolean {
  const k = key.toLowerCase();
  return SECRET_KEY_HINTS.some((h) => k.includes(h));
}

function clip(s: string): string {
  return s.length <= MAX_STRING ? s : `${s.slice(0, MAX_STRING)}…[${s.length} chars]`;
}

// Recursively strip secrets + clip oversized values. Returns something always
// safe to JSON.stringify (cycles become "[Circular]").
export function redactContext(input: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (input == null) return input;
  if (typeof input === "string") return clip(input);
  if (typeof input === "number" || typeof input === "boolean") return input;
  if (typeof input === "bigint") return input.toString();
  if (typeof input === "function" || typeof input === "symbol") return undefined;
  if (input instanceof Date) return input.toISOString();
  if (input instanceof Error) {
    return { name: input.name, message: clip(input.message), stack: clip(input.stack ?? "") };
  }
  if (depth >= MAX_DEPTH) return "[Max depth]";

  if (typeof input === "object") {
    if (seen.has(input as object)) return "[Circular]";
    seen.add(input as object);

    if (Array.isArray(input)) {
      // Cap array length so a big list can't dominate the row.
      return input.slice(0, 100).map((v) => redactContext(v, depth + 1, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = isSecretKey(k) ? "[REDACTED]" : redactContext(v, depth + 1, seen);
    }
    return out;
  }
  return String(input);
}

// Final guard: redact, then hard-cap total size.
export function safeContext(input: unknown): Record<string, unknown> {
  const red = redactContext(input);
  const obj =
    red && typeof red === "object" && !Array.isArray(red)
      ? (red as Record<string, unknown>)
      : { value: red };
  try {
    const json = JSON.stringify(obj);
    if (json.length > MAX_CONTEXT_BYTES) {
      return { _truncated: true, _bytes: json.length, preview: json.slice(0, 4_000) };
    }
  } catch {
    return { _unserializable: true };
  }
  return obj;
}

// Drop the identifying tail of an IP so we can spot one abusive source without
// pinpointing a household. IPv4 keeps the first three octets; IPv6 keeps the
// first four hextets (its routing prefix).
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  // x-forwarded-for can be a list; the client is the first entry.
  const first = ip.split(",")[0]?.trim() ?? "";
  if (!first) return null;
  if (first.includes(":")) {
    const parts = first.split(":").filter(Boolean).slice(0, 4);
    return parts.length ? `${parts.join(":")}::/64` : null;
  }
  const octets = first.split(".");
  if (octets.length !== 4) return null;
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

export function coerceLevel(v: unknown): LogLevel {
  return LOG_LEVELS.includes(v as LogLevel) ? (v as LogLevel) : "info";
}

// Rows -> CSV for the admin export. Quotes per RFC 4180 (double the quotes,
// wrap anything containing a comma/quote/newline).
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown): string => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(esc).join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return body ? `${head}\n${body}` : head;
}

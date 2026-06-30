// Format a stored phone string for display. US 10-digit → 201-555-0142,
// 11-digit leading 1 → 1-201-555-0142. Anything else (international, partial,
// already-formatted in an unexpected way) is returned unchanged.
export function formatPhone(raw: string | null | undefined): string {
  const value = raw ?? "";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
}

// Human-friendly "last used" string for the API usage panel. Recent times read
// relative ("just now", "5 minutes ago", "3 days ago"); anything a week or older
// falls back to an absolute UTC date (e.g. "Jun 12, 2026"). `null`/`undefined`
// means the key has never been used. `now` is injectable for deterministic tests.
//
// UTC is intentional for the absolute fallback so a server-rendered string and a
// client re-render agree (no hydration drift) — same approach as the changelog.
export function formatLastUsed(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (value == null) return "Never used yet";
  const then = value instanceof Date ? value : new Date(value);
  const ms = then.getTime();
  if (Number.isNaN(ms)) return "Never used yet";

  const diffMs = now.getTime() - ms;
  // Clock skew or a freshly-written timestamp in the future → treat as "just now".
  if (diffMs < 60_000) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return then.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

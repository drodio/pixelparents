// Normalization for social handles collected at onboarding (V2 round 2 adds
// Instagram + X alongside LinkedIn/GitHub/WeChat). Pure so the sanitizer and
// the UI share one rule and it unit-tests without a DB.
//
// Handles, not URLs: people paste "@name", "name", or a full profile URL; we
// store the bare handle and build the URL at render time.

const HANDLE_MAX = 30;

// Accepts "@name", "name", "instagram.com/name", "https://www.instagram.com/name/",
// "x.com/name", "twitter.com/name" — returns the bare handle, or null when
// nothing usable remains. Allowed chars: letters, digits, dot, underscore
// (Instagram) / underscore (X) — we accept the union; the platforms 404 an
// invalid one, which is the member's own to fix.
export function normalizeSocialHandle(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  // Strip a pasted URL down to its first path segment.
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  const slash = s.indexOf("/");
  if (slash >= 0 && /^(instagram\.com|x\.com|twitter\.com)$/i.test(s.slice(0, slash))) {
    s = s.slice(slash + 1);
  }
  s = s.split(/[/?#]/, 1)[0] ?? "";
  s = s.replace(/^@+/, "");
  s = s.replace(/[^A-Za-z0-9._]/g, "");
  s = s.slice(0, HANDLE_MAX);
  return s.length > 0 ? s : null;
}

export function instagramUrlFor(handle: string): string {
  return `https://instagram.com/${handle}`;
}

export function xUrlFor(handle: string): string {
  return `https://x.com/${handle}`;
}

// Read the stored handles back out of the extra jsonb blob.
export function instagramHandleOf(extra: Record<string, unknown> | null | undefined): string | null {
  const v = (extra ?? {}).instagramHandle;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function xHandleOf(extra: Record<string, unknown> | null | undefined): string | null {
  const v = (extra ?? {}).xHandle;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function discordHandleOf(extra: Record<string, unknown> | null | undefined): string | null {
  const v = (extra ?? {}).discordHandle;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

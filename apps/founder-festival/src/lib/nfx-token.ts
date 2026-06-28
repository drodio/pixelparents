// Decode the expiry of the NFX Signal JWT (NFX_SIGNAL_TOKEN) so a weekly cron
// can warn us before it lapses and silently breaks the NFX scraper. Pure +
// dependency-free so it's easy to unit-test; never throws.

export type TokenExpiry = {
  exp: number; // unix seconds
  expiresAt: string; // ISO
  daysLeft: number; // fractional days from now (negative = already expired)
  expired: boolean;
};

function b64urlDecode(s: string): string | null {
  try {
    const pad = s + "=".repeat((4 - (s.length % 4)) % 4);
    const b64 = pad.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return null;
  }
}

// Returns the token's expiry, or null if it's missing/not a JWT/has no exp.
export function getTokenExpiry(token: string | undefined | null, now = Date.now()): TokenExpiry | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const json = b64urlDecode(parts[1]!);
  if (!json) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  const exp = (payload as { exp?: unknown })?.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  const daysLeft = (exp * 1000 - now) / 86_400_000;
  return {
    exp,
    expiresAt: new Date(exp * 1000).toISOString(),
    daysLeft,
    expired: exp * 1000 <= now,
  };
}

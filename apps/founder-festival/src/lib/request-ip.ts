// Deriving the client IP for rate-limiting is security-sensitive: if we trust a
// header the client can set, an abuser bypasses every per-IP limit by rotating
// that header's value on each request.
//
// On Vercel, the ONLY trustworthy source is `x-vercel-forwarded-for`: Vercel's
// edge sets it to the real client IP and strips any inbound copy, so a client
// cannot forge it. `x-real-ip` and `x-forwarded-for` ARE attacker-controllable
// (any client can send them), so they are used ONLY as a best-effort fallback
// when the trusted header is absent — i.e. local dev / self-hosting, where
// there's no Vercel edge and there is no abuse surface anyway.
//
// Per-IP limits are still defeatable by an attacker with many real IPs (IPv6,
// botnets, proxies); the global daily circuit-breaker (see rate-limit.ts) is the
// backstop that actually bounds spend regardless of IP.
export function getRequestIp(headers: Headers): string {
  const trusted = headers.get("x-vercel-forwarded-for");
  if (trusted) return trusted.split(",")[0]!.trim();
  // --- not on Vercel: untrusted fallbacks, dev only ---
  const xri = headers.get("x-real-ip");
  if (xri) return xri.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "0.0.0.0";
}

export type RequestGeo = {
  ip: string;
  city: string | null;
  region: string | null; // state / region code, e.g. "CA"
  country: string | null; // ISO code, e.g. "US"
};

// Best-effort requester IP + approximate location. On Vercel the edge sets
// x-vercel-ip-* headers (city is URL-encoded). Locally these are absent, so
// city/region/country come back null and only the IP is populated.
export function getRequestGeo(headers: Headers): RequestGeo {
  const dec = (v: string | null): string | null => {
    if (!v) return null;
    try {
      return decodeURIComponent(v).trim() || null;
    } catch {
      return v.trim() || null;
    }
  };
  return {
    ip: getRequestIp(headers),
    city: dec(headers.get("x-vercel-ip-city")),
    region: dec(headers.get("x-vercel-ip-country-region")),
    country: dec(headers.get("x-vercel-ip-country")),
  };
}

// Redirect-URI validation. Open redirect → token theft is the #1 OAuth bug, so
// we require an EXACT string match against the client's registered allowlist —
// no wildcards, no prefix/substring/host-only matching. The string the client
// sends on /authorize must be byte-for-byte one of its registered URIs, and the
// same value must be presented again at token exchange.

// Normalize a candidate URI for registration storage. We trim only; we do NOT
// canonicalize (lowercasing host, stripping default ports, etc.) because exact
// match means the registered form and the request form must be identical, and a
// surprise normalization could let two "different" strings collide. Returns null
// for anything that isn't a syntactically valid absolute http(s) URL.
export function normalizeRedirectUri(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  // http is allowed ONLY for localhost loopback dev (matches the design's
  // "HTTPS only, except http://localhost for dev").
  if (u.protocol === "http:" && !isLoopback(u.hostname)) return null;
  // A fragment in a registered/used redirect URI is invalid per OAuth (the
  // fragment is reserved for the response).
  if (u.hash) return null;
  return s;
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

// Does `candidate` exactly match one of the registered URIs?
export function redirectUriAllowed(
  candidate: string,
  registered: readonly string[],
): boolean {
  if (!candidate) return false;
  return registered.includes(candidate);
}

// Validate + dedupe a list of redirect URIs at registration time. Returns the
// cleaned list, or an error message naming the first bad entry.
export function validateRedirectUris(
  raw: string[],
): { ok: true; uris: string[] } | { ok: false; error: string } {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const trimmed = r.trim();
    if (!trimmed) continue;
    const norm = normalizeRedirectUri(trimmed);
    if (!norm) {
      return {
        ok: false,
        error: `"${trimmed}" is not a valid redirect URI (must be an absolute https:// URL, or http://localhost for dev, with no fragment).`,
      };
    }
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  if (out.length === 0) {
    return { ok: false, error: "At least one redirect URI is required." };
  }
  return { ok: true, uris: out };
}

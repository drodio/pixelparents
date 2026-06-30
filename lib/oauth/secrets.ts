import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Credential generation + hashing for OAuth clients and auth codes. Mirrors the
// repo's existing pattern in lib/api-keys.ts: vendor-namespaced, random secret,
// store only the SHA-256 hash, reveal the raw value exactly once.

// Public, non-secret app identifier (safe to embed in a browser button).
export const CLIENT_ID_PREFIX = "ppc_live_";
// Confidential client secret (shown once at registration / rotation).
export const CLIENT_SECRET_PREFIX = "ppcs_live_";

export function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// A new client_id — public, so just a recognizable random identifier.
export function generateClientId(): string {
  return `${CLIENT_ID_PREFIX}${randomBytes(12).toString("hex")}`;
}

// A new client secret. Returns the raw secret (shown once), its SHA-256 hash
// (what we store), and a short display prefix for the dashboard list.
export function generateClientSecret(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const secret = randomBytes(24).toString("base64url");
  const raw = `${CLIENT_SECRET_PREFIX}${secret}`;
  return { raw, hash: sha256(raw), prefix: raw.slice(0, CLIENT_SECRET_PREFIX.length + 4) };
}

// Constant-time comparison of a presented client secret against a stored hash.
export function verifyClientSecret(presented: string, storedHash: string): boolean {
  const a = Buffer.from(sha256(presented));
  const b = Buffer.from(storedHash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// A fresh authorization code (raw value returned to the browser; only its hash is
// persisted). High-entropy, url-safe.
export function generateAuthCode(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256(raw) };
}

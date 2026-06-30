import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// PKCE (Proof Key for Code Exchange, RFC 7636) — S256 only.
//
// The client generates a high-entropy `code_verifier`, derives
// `code_challenge = BASE64URL(SHA256(verifier))`, and sends the CHALLENGE on the
// /oauth/authorize request. At token exchange it sends the raw VERIFIER; we
// re-derive the challenge and compare. This binds the auth code to the client
// instance that started the flow, defeating code-interception attacks even when
// (as we require) the redirect URI is exact-matched. We REQUIRE method=S256 and
// reject `plain` (a downgrade that removes the protection).

export const PKCE_METHOD = "S256" as const;

// Derive the S256 challenge from a verifier. Pure; used by tests and (in the
// token route) to verify the presented verifier matches the stored challenge.
export function deriveS256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// RFC 7636 §4.1: verifier is 43–128 chars from the unreserved set
// [A-Za-z0-9-._~]. We validate length + charset before using it so a malformed
// value is rejected as invalid_grant rather than silently mis-hashed.
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isValidCodeVerifier(verifier: string): boolean {
  return VERIFIER_RE.test(verifier);
}

// A challenge is base64url of a 32-byte digest → 43 base64url chars, no padding.
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeChallenge(challenge: string): boolean {
  return CHALLENGE_RE.test(challenge);
}

// Constant-time check that a presented verifier matches a stored S256 challenge.
// Returns false (never throws) on any malformed input so callers can map it
// straight to an invalid_grant error.
export function verifyPkce(verifier: string, storedChallenge: string): boolean {
  if (!isValidCodeVerifier(verifier)) return false;
  const derived = deriveS256Challenge(verifier);
  const a = Buffer.from(derived);
  const b = Buffer.from(storedChallenge);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Generate a fresh verifier/challenge pair (used by the demo + tests; real
// clients generate their own). 32 random bytes → 43-char base64url verifier.
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: deriveS256Challenge(verifier) };
}

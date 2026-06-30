// PKCE (RFC 7636), state, and nonce generation — Web Crypto only, so this runs
// unchanged in the browser, in Node 18+, in Deno, and in edge runtimes. Pixel
// Parents requires the S256 challenge method (the `plain` downgrade is rejected
// server-side), so that's all we generate.

function getCrypto(): Crypto {
  // globalThis.crypto is standard in browsers, Node >=18, Deno, and Workers.
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== "function" || !c.subtle) {
    throw new Error(
      "@pixelparents/auth requires the Web Crypto API (globalThis.crypto with subtle). " +
        "Use a browser, Node 18+, Deno, or an edge runtime.",
    );
  }
  return c;
}

// base64url encode raw bytes, no padding (RFC 7636 §A).
function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!);
  return btoaPolyfill(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// btoa exists in browsers/Workers; fall back to Buffer in Node-only contexts.
function btoaPolyfill(binary: string): string {
  if (typeof btoa === "function") return btoa(binary);
  const B = (globalThis as { Buffer?: { from(s: string, enc: string): { toString(enc: string): string } } }).Buffer;
  if (B) return B.from(binary, "binary").toString("base64");
  throw new Error("No base64 encoder available (btoa / Buffer).");
}

// A high-entropy random string of `bytes` bytes, base64url-encoded. 32 bytes →
// 43 base64url chars, satisfying the RFC 7636 verifier length (43–128).
export function randomUrlSafe(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  getCrypto().getRandomValues(buf);
  return base64UrlEncode(buf);
}

export type PkcePair = {
  /** The secret kept by the client and presented at the token exchange. */
  codeVerifier: string;
  /** BASE64URL(SHA256(codeVerifier)) — sent on the authorize request. */
  codeChallenge: string;
  /** Always "S256" — Pixel Parents rejects "plain". */
  codeChallengeMethod: "S256";
};

// Derive the S256 challenge from a verifier: BASE64URL(SHA256(verifier)).
export async function deriveS256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await getCrypto().subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

// Generate a fresh PKCE verifier/challenge pair. The verifier is a 32-byte
// random value (→ 43 base64url chars, RFC-compliant), the challenge its S256
// hash.
export async function generatePkcePair(): Promise<PkcePair> {
  const codeVerifier = randomUrlSafe(32);
  const codeChallenge = await deriveS256Challenge(codeVerifier);
  return { codeVerifier, codeChallenge, codeChallengeMethod: "S256" };
}

// Convenience: a fresh, unguessable `state` (CSRF) and `nonce` (replay) value.
export function generateState(): string {
  return randomUrlSafe(16);
}
export function generateNonce(): string {
  return randomUrlSafe(16);
}

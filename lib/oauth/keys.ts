import { importPKCS8, importJWK, exportJWK, calculateJwkThumbprint, type JWK } from "jose";

// RS256 signing key management for the OIDC provider.
//
// The PRIVATE key lives in ONE env var, never in the DB or the repo:
//   OAUTH_PRIVATE_KEY  — an RS256 private key in PKCS#8 PEM form.
// Generate one with:
//   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out key.pem
//   # then paste the file contents (incl. the BEGIN/END lines) into the env var.
// A multi-line PEM survives a .env / Vercel env var fine; we also accept a PEM
// with literal "\n" escapes (some env UIs collapse newlines) and normalize them.
//
// The PUBLIC half is derived from the private key and published at
// /.well-known/jwks.json so any standard OIDC client can verify our ID tokens.
//
// If the env var is UNSET or malformed, getSigningKey() throws OAuthKeyError with
// a clear message. The endpoints catch this and return a clean 500/"provider not
// configured" response rather than crashing — the provider degrades loudly, not
// silently.

export class OAuthKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthKeyError";
  }
}

export const SIGNING_ALG = "RS256" as const;

type SigningKey = {
  key: CryptoKey;
  kid: string;
  publicJwk: JWK;
};

let cached: Promise<SigningKey> | null = null;

function normalizePem(raw: string): string {
  // Tolerate env UIs that escape newlines as the two characters backslash-n.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

async function loadSigningKey(): Promise<SigningKey> {
  const raw = process.env.OAUTH_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new OAuthKeyError(
      "OAUTH_PRIVATE_KEY is not set. Generate an RS256 PKCS#8 PEM (see lib/oauth/keys.ts) and set it in the environment.",
    );
  }
  const pem = normalizePem(raw);
  let key: CryptoKey;
  try {
    key = await importPKCS8(pem, SIGNING_ALG, { extractable: true });
  } catch {
    throw new OAuthKeyError(
      "OAUTH_PRIVATE_KEY could not be parsed as an RS256 PKCS#8 PEM private key.",
    );
  }
  // Export the JWK, then build a PUBLIC-ONLY JWK by allow-listing exactly the
  // public RSA members (kty, n, e). exportJWK on a private key returns the full
  // private JWK (d, p, q, dp, dq, qi) — we must NEVER let any of those reach the
  // JWKS endpoint, so we copy only the public fields rather than deleting known
  // private ones (a deny-list could miss a member). The `kid` is the RFC 7638
  // thumbprint, which for RSA is computed over exactly {e, kty, n} — so it's
  // stable whether derived from the public or private JWK.
  const full = (await exportJWK(key)) as Record<string, unknown>;
  const publicOnly: JWK = { kty: full.kty as string, n: full.n as string, e: full.e as string };
  const kid = await calculateJwkThumbprint(publicOnly);
  const finalJwk: JWK = { ...publicOnly, kid, alg: SIGNING_ALG, use: "sig" };
  return { key, kid, publicJwk: finalJwk };
}

// Cached promise so we import/parse the key once per cold start; reset on error
// so a transient failure (or a corrected env var on the next invocation) retries.
export function getSigningKey(): Promise<SigningKey> {
  if (!cached) {
    cached = loadSigningKey().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

// The public JWKS document served at /.well-known/jwks.json.
export async function publicJwks(): Promise<{ keys: JWK[] }> {
  const { publicJwk } = await getSigningKey();
  return { keys: [publicJwk] };
}

// The PUBLIC verification key, derived from the published JWKS, for verifying
// tokens we minted (e.g. the access token at /userinfo). The signing CryptoKey is
// a PRIVATE key and can't verify; we import the public JWK instead. Cached.
let cachedVerifyKey: Promise<CryptoKey> | null = null;
export function getVerifyKey(): Promise<CryptoKey> {
  if (!cachedVerifyKey) {
    cachedVerifyKey = (async () => {
      const { publicJwk } = await getSigningKey();
      return (await importJWK(publicJwk, SIGNING_ALG)) as CryptoKey;
    })().catch((e) => {
      cachedVerifyKey = null;
      throw e;
    });
  }
  return cachedVerifyKey;
}

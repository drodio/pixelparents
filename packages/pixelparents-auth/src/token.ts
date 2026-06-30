import type { IdTokenClaims, TokenResponse } from "./types.js";
import { OAuthError } from "./types.js";

export type ExchangeCodeOptions = {
  tokenEndpoint: string;
  code: string;
  /** The PKCE secret generated at the start of the flow. */
  codeVerifier: string;
  /** Must byte-for-byte match the redirect_uri used on the authorize request. */
  redirectUri: string;
  clientId: string;
  /**
   * The client secret. REQUIRED by the live provider (confidential client) and
   * therefore this MUST run server-side — never ship the secret to a browser.
   */
  clientSecret: string;
  /** Override fetch (tests, custom agents). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
};

// Exchange an authorization code (+ PKCE verifier + client credentials) for
// tokens at POST /api/oauth/token. The provider authenticates the confidential
// client via client_secret_post (form body) — this call carries the secret, so
// it MUST happen on a server, never in the browser. On any OAuth error the
// provider returns { error, error_description }, which we surface as OAuthError.
export async function exchangeCode(opts: ExchangeCodeOptions): Promise<TokenResponse> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    code_verifier: opts.codeVerifier,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });

  const res = await fetchImpl(opts.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.error === "string") {
    throw new OAuthError(
      typeof json.error === "string" ? json.error : "token_request_failed",
      typeof json.error_description === "string" ? json.error_description : undefined,
      res.status,
    );
  }
  if (typeof json.id_token !== "string" || typeof json.access_token !== "string") {
    throw new OAuthError("invalid_token_response", "Response missing id_token/access_token.", res.status);
  }
  return json as unknown as TokenResponse;
}

export type VerifyIdTokenOptions = {
  idToken: string;
  /** The provider's JWKS URL, e.g. https://pixelparents.org/.well-known/jwks.json */
  jwksUri: string;
  /** The expected `iss` — the provider issuer URL. */
  issuer: string;
  /** Your client_id — the expected `aud`. */
  audience: string;
  /**
   * If you started the flow with a nonce, pass it: the SDK asserts the ID token's
   * `nonce` claim matches (replay protection). Omit only if you didn't send one.
   */
  nonce?: string;
};

// Verify an ID token's RS256 signature against the published JWKS, plus
// iss/aud/exp/nonce, and return the typed claims. Uses `jose` (a peer dependency)
// loaded dynamically so the browser authorize helpers don't bundle it. After this
// resolves, `claims.ohs_verified === true` is a trustworthy signed assertion of
// OHS membership.
export async function verifyIdToken(opts: VerifyIdTokenOptions): Promise<IdTokenClaims> {
  let jose: typeof import("jose");
  try {
    jose = await import("jose");
  } catch {
    throw new Error(
      "verifyIdToken requires the `jose` package. Install it: `npm i jose`. " +
        "(It's an optional peer dependency, only needed for server-side verification.)",
    );
  }

  const JWKS = jose.createRemoteJWKSet(new URL(opts.jwksUri));
  let payload: import("jose").JWTPayload;
  try {
    const result = await jose.jwtVerify(opts.idToken, JWKS, {
      issuer: opts.issuer,
      audience: opts.audience,
      algorithms: ["RS256"],
    });
    payload = result.payload;
  } catch (e) {
    throw new OAuthError("invalid_id_token", e instanceof Error ? e.message : String(e));
  }

  if (opts.nonce !== undefined && payload.nonce !== opts.nonce) {
    throw new OAuthError("invalid_nonce", "ID token nonce does not match the request nonce.");
  }

  return payload as IdTokenClaims;
}

// Decode a JWT payload WITHOUT verifying it. Handy for debugging / reading the
// claims of an already-verified token client-side. NEVER trust the result of this
// for an authorization decision — use verifyIdToken on a server for that.
export function decodeJwtUnsafe(jwt: string): IdTokenClaims | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? atob(payload)
        : (globalThis as { Buffer?: { from(s: string, e: string): { toString(e: string): string } } }).Buffer!.from(
            payload,
            "base64",
          ).toString("utf8");
    return JSON.parse(json) as IdTokenClaims;
  } catch {
    return null;
  }
}

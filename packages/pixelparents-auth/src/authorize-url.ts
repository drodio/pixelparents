import type { Scope } from "./types.js";

export type BuildAuthorizeUrlOptions = {
  /** The provider's authorization endpoint, e.g. https://pixelparents.org/oauth/authorize */
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  /** Scopes as an array or a pre-joined string. `openid` is required; we add it if missing. */
  scope: readonly Scope[] | string;
  state: string;
  nonce: string;
  /** BASE64URL(SHA256(code_verifier)) from generatePkcePair(). */
  codeChallenge: string;
  /** Extra authorization parameters (e.g. prompt, login_hint) if ever needed. */
  extraParams?: Record<string, string>;
};

// Normalize a scope input to a deduped, space-delimited string that always
// contains `openid` (required for an OIDC request — the provider rejects the
// request otherwise).
export function normalizeScope(scope: readonly Scope[] | string): string {
  const list = Array.isArray(scope) ? scope : String(scope).split(/\s+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const s = String(raw).trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  if (!seen.has("openid")) out.unshift("openid");
  return out.join(" ");
}

// Build the full /oauth/authorize URL for an Authorization Code + PKCE (S256)
// request. Pure and deterministic given its inputs — the unit tests assert every
// query parameter, so a regression in the flow shape is caught immediately.
export function buildAuthorizeUrl(opts: BuildAuthorizeUrlOptions): string {
  const url = new URL(opts.authorizationEndpoint);
  const params = url.searchParams;
  params.set("response_type", "code");
  params.set("client_id", opts.clientId);
  params.set("redirect_uri", opts.redirectUri);
  params.set("scope", normalizeScope(opts.scope));
  params.set("state", opts.state);
  params.set("nonce", opts.nonce);
  params.set("code_challenge", opts.codeChallenge);
  params.set("code_challenge_method", "S256");
  for (const [k, v] of Object.entries(opts.extraParams ?? {})) {
    params.set(k, v);
  }
  return url.toString();
}

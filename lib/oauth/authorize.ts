import { parseScopes, type SupportedScope } from "./config";
import { isValidCodeChallenge } from "./pkce";
import { redirectUriAllowed } from "./redirect";
import type { OAuthClientRow } from "./store";

// Pure validation of an /oauth/authorize request. Splitting this out of the route
// keeps the security-critical rules (exact redirect match, PKCE-required-S256,
// scope capping, response_type) unit-testable without a Next runtime or a DB.
//
// Two error shapes, per OAuth 2.0 §4.1.2.1:
//   - "fatal" errors (bad client_id, bad/unregistered redirect_uri) MUST NOT
//     redirect — we have no trusted place to send the user — so we render an
//     error page instead.
//   - "redirectable" errors (unsupported response_type, bad scope, missing PKCE)
//     are reported back to the registered redirect_uri as ?error=...&state=...

export type AuthorizeParams = {
  client_id?: string | null;
  redirect_uri?: string | null;
  response_type?: string | null;
  scope?: string | null;
  state?: string | null;
  nonce?: string | null;
  code_challenge?: string | null;
  code_challenge_method?: string | null;
};

export type AuthorizeValidation =
  | { ok: true; client: OAuthClientRow; redirectUri: string; scopes: SupportedScope[]; state: string | null; nonce: string | null; codeChallenge: string }
  | { ok: false; kind: "fatal"; error: string; description: string }
  | { ok: false; kind: "redirect"; redirectUri: string; error: string; description: string; state: string | null };

export function validateAuthorize(
  params: AuthorizeParams,
  client: OAuthClientRow | null,
): AuthorizeValidation {
  const state = params.state ?? null;

  // 1. client_id must resolve to an active client (fatal — can't trust a redirect).
  if (!params.client_id || !client) {
    return { ok: false, kind: "fatal", error: "invalid_client", description: "Unknown or missing client_id." };
  }

  // 2. redirect_uri must be present and EXACT-match a registered URI (fatal —
  //    redirecting to an unregistered URI is the open-redirect attack itself).
  const redirectUri = params.redirect_uri ?? "";
  if (!redirectUri || !redirectUriAllowed(redirectUri, client.redirect_uris)) {
    return {
      ok: false,
      kind: "fatal",
      error: "invalid_request",
      description: "The redirect_uri does not exactly match a registered URI for this app.",
    };
  }

  // From here, errors can be reported back to the (now-trusted) redirect_uri.
  const fail = (error: string, description: string): AuthorizeValidation => ({
    ok: false,
    kind: "redirect",
    redirectUri,
    error,
    description,
    state,
  });

  // 3. response_type must be `code` (we only support the auth-code flow).
  if (params.response_type !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }

  // 4. PKCE is REQUIRED and must be S256 (we reject `plain` — a downgrade).
  if (!params.code_challenge) {
    return fail("invalid_request", "code_challenge is required (PKCE).");
  }
  if ((params.code_challenge_method ?? "") !== "S256") {
    return fail("invalid_request", "code_challenge_method must be S256.");
  }
  if (!isValidCodeChallenge(params.code_challenge)) {
    return fail("invalid_request", "code_challenge is malformed.");
  }

  // 5. Scopes: must include `openid` (OIDC), drop unknowns, and cap to what the
  //    client is allowed to request (oauth_clients.allowed_scopes).
  const requested = parseScopes(params.scope);
  if (!requested.includes("openid")) {
    return fail("invalid_scope", "The openid scope is required.");
  }
  const allowed = new Set(client.allowed_scopes);
  const capped = requested.filter((s) => allowed.has(s));
  if (!capped.includes("openid")) {
    return fail("invalid_scope", "This app is not permitted to request the openid scope.");
  }

  return {
    ok: true,
    client,
    redirectUri,
    scopes: capped,
    state,
    nonce: params.nonce ?? null,
    codeChallenge: params.code_challenge,
  };
}

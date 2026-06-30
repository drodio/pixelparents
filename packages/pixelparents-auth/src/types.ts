// Shared types + the Pixel Parents scope/claim vocabulary. These mirror the live
// provider (app/.well-known/openid-configuration). MVP advertises exactly three
// scopes; the v1 set is documented but not yet emitted.

// The scopes the live MVP provider supports. `openid` is required for any OIDC
// request; `email` adds the email claim; `ohs_verified` is the differentiator —
// a signed assertion that the user is a verified Stanford OHS student or parent.
export const MVP_SCOPES = ["openid", "email", "ohs_verified"] as const;
export type MvpScope = (typeof MVP_SCOPES)[number];

// A scope string is just a space-delimited list; we accept any string so the SDK
// keeps working as the provider adds scopes (e.g. profile, role, grade_band)
// without an SDK upgrade.
export type Scope = MvpScope | (string & {});

// The ID-token claims the live provider can emit. Standard OIDC claims are always
// present; `email`/`ohs_verified` ride their scopes. Extra (future) claims are
// allowed via the index signature so reading e.g. `role` never type-errors.
export type IdTokenClaims = {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  /** THE PRODUCT: a signed assertion of verified OHS membership. */
  ohs_verified?: boolean;
  // Forward-compatible: future scopes (role, grade_band, family_id, …).
  [claim: string]: unknown;
};

// The raw token response from POST /api/oauth/token.
export type TokenResponse = {
  access_token: string;
  id_token: string;
  token_type: "Bearer";
  expires_in: number;
  id_token_expires_in?: number;
  scope: string;
};

// Everything the client must persist between the authorize redirect and the
// callback (store it in sessionStorage in the browser, or a signed cookie/server
// session for the server-side flow). All of it is required to safely complete
// the exchange.
export type AuthRequestState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  scope: string;
};

// An OAuth error returned on the redirect (?error=...) or from /token.
export class OAuthError extends Error {
  readonly error: string;
  readonly errorDescription?: string;
  readonly status?: number;
  constructor(error: string, description?: string, status?: number) {
    super(description ? `${error}: ${description}` : error);
    this.name = "OAuthError";
    this.error = error;
    this.errorDescription = description;
    this.status = status;
  }
}

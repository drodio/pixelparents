// Static configuration + scope vocabulary for the Pixel Parents OIDC provider.
// Kept dependency-free (no DB, no node:crypto) so it's safe to import anywhere,
// including the discovery endpoint and pure scope tests.

// MVP scopes. `openid` marks an OIDC request; `email` adds the email claim;
// `ohs_verified` is THE DIFFERENTIATOR — a signed assertion that the user is a
// verified Stanford OHS student or parent, something Google/Apple/GitHub cannot
// provide. v1 will add `profile`, `role`, `family`, `student_grade`.
export const SUPPORTED_SCOPES = ["openid", "email", "ohs_verified"] as const;
export type SupportedScope = (typeof SUPPORTED_SCOPES)[number];

// Auth codes are single-use and very short-lived: enough for a server-side token
// exchange, far too short to be replayed if intercepted.
export const CODE_TTL_SECONDS = 60;

// Token lifetimes. The ID token IS the identity assertion; the access token is a
// bearer for any future /userinfo or scoped Pixel Parents API call (MVP puts all
// claims in the ID token, but we still mint a usable access token).
export const ID_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

// The issuer + endpoint base URL. Prefer an explicit OAUTH_ISSUER (so it's stable
// and matches the `iss` third-party clients pin), then the deployment URL, then a
// localhost dev default. No trailing slash.
export function issuerUrl(): string {
  const explicit = process.env.OAUTH_ISSUER?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

// Parse a space-delimited `scope` string into a deduped, validated list. Unknown
// scopes are dropped (not an error — standard OAuth tolerance), but `openid` is
// required for an OIDC request and the caller enforces that.
export function parseScopes(raw: string | null | undefined): SupportedScope[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: SupportedScope[] = [];
  for (const tok of raw.split(/\s+/)) {
    const s = tok.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    if ((SUPPORTED_SCOPES as readonly string[]).includes(s)) {
      out.push(s as SupportedScope);
    }
  }
  return out;
}

// Human-readable consent copy for each scope (shown on the Allow/Deny screen).
export const SCOPE_DESCRIPTIONS: Record<SupportedScope, string> = {
  openid: "Sign you in with Pixel Parents",
  email: "See your email address",
  ohs_verified: "Confirm you're a verified Stanford OHS student or parent",
};

// The discovery document (.well-known/openid-configuration). Mirrors the shape a
// standard OIDC client (Auth.js, openid-client) expects so it works with zero
// custom code. MVP advertises only what we implement.
export function discoveryDocument(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    id_token_signing_alg_values_supported: ["RS256"],
    subject_types_supported: ["public"],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: [...SUPPORTED_SCOPES],
    claims_supported: ["sub", "iss", "aud", "exp", "iat", "nonce", "email", "ohs_verified"],
  };
}

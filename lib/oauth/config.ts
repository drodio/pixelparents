// Static configuration + scope vocabulary for the GoPixel OIDC provider.
// Kept dependency-free (no DB, no node:crypto) so it's safe to import anywhere,
// including the discovery endpoint and pure scope tests.

// V1 scopes. `openid` marks an OIDC request; `email` adds the email claim;
// `ohs_verified` is THE DIFFERENTIATOR — a signed assertion that the user is a
// verified Stanford OHS student or parent, something Google/Apple/GitHub cannot
// provide. V1 adds:
//   `role`        — parent | student | alumni (coarse identity, no PII)
//   `grade_band`  — middle | high (NEVER the exact grade; minor-privacy coarsening)
//   `family`      — an HMAC'd, per-client family_id for in-app linkage that can't
//                   correlate a user across the ecosystem.
export const SUPPORTED_SCOPES = [
  "openid",
  "email",
  "ohs_verified",
  "role",
  "grade_band",
  "family",
] as const;
export type SupportedScope = (typeof SUPPORTED_SCOPES)[number];

// Scopes that disclose data about a MINOR (a student account). An app requesting
// any of these gets extra scrutiny at registration/approval (the design's "human
// eyes on apps asking for minors' data"). `ohs_verified`/`role` reveal student
// status; `grade_band` is age-adjacent. We flag the set so the registration UI and
// admin view can highlight it.
export const MINOR_DATA_SCOPES: readonly SupportedScope[] = [
  "ohs_verified",
  "role",
  "grade_band",
];

export function requestsMinorData(scopes: readonly string[]): boolean {
  const set = new Set(scopes);
  return MINOR_DATA_SCOPES.some((s) => set.has(s));
}

// Auth codes are single-use and very short-lived: enough for a server-side token
// exchange, far too short to be replayed if intercepted.
export const CODE_TTL_SECONDS = 60;

// Token lifetimes. The ID token IS the identity assertion; the access token is a
// bearer for /userinfo and any future scoped GoPixel API call.
export const ID_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
// Refresh tokens are opaque, hashed at rest, and rotated on every use. 30-day
// sliding window — a long-lived grant that re-mints fresh ID/access tokens without
// re-prompting, until the user revokes it.
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

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

// Human-readable consent copy for each scope (shown on the Allow/Deny screen). The
// consent screen lists EXACTLY the requested scopes in plain language.
export const SCOPE_DESCRIPTIONS: Record<SupportedScope, string> = {
  openid: "Sign you in with GoPixel",
  email: "See your email address",
  ohs_verified: "Confirm you're a verified Stanford OHS student or parent",
  role: "See whether you're a parent, student, or alumni",
  grade_band: "See whether you're in middle or high school (never your exact grade)",
  family: "Link your family within this app (an anonymous, app-specific id)",
};

// The discovery document (.well-known/openid-configuration). Mirrors the shape a
// standard OIDC client (Auth.js, openid-client) expects so it works with zero
// custom code. Advertises exactly what we implement.
export function discoveryDocument(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    userinfo_endpoint: `${issuer}/api/oauth/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    revocation_endpoint: `${issuer}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    id_token_signing_alg_values_supported: ["RS256"],
    // Pairwise per-client `sub` is the default and ONLY mode (apps can't correlate
    // the same user across the ecosystem).
    subject_types_supported: ["pairwise"],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: [...SUPPORTED_SCOPES],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "exp",
      "iat",
      "nonce",
      "email",
      "email_verified",
      "ohs_verified",
      "ohs_verified_method",
      "role",
      "grade_band",
      "family_id",
    ],
  };
}

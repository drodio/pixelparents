## Progress Update as of [June 30, 2026 — 6:49 AM Pacific]

### Summary of changes since last update
First entry. Built the MVP of **"Sign in with Pixel Parents"** — a thin OpenID
Connect provider (OAuth 2.0 Authorization Code + PKCE S256) on top of the app's
existing Clerk login + Neon DB, whose differentiator is a signed, verified-OHS
identity claim (`ohs_verified`). Smallest thing that proves `ohs_verified` to one
external app: 2 self-healing tables, the provider core in `lib/oauth/*`, the
authorize/token/discovery/JWKS endpoints, a self-serve app-registration section in
the Developers tab, and a demo doc. `jose` added for RS256 signing. tsc + lint
clean; 453 tests pass (29 new oauth tests); `npm run build` OK.

### Detail of changes made
- **Dependency:** added `jose@^6.2.3` (the only "buy" — audited JWT/JWKS lib).
- **Self-contained DDL** (`lib/oauth/ensure.ts`): `ensureOAuthSchema()` creates
  `oauth_clients` + `oauth_codes` idempotently in one round-trip, pattern-matching
  `lib/admin.ts:ensureAdminsTable` / `ensureApiKeysTable`. Does NOT touch the
  shared `lib/db/ensure.ts` or the Drizzle schema index. Every read/write path
  calls it first (the country-column P0 lesson).
- **Provider core** (`lib/oauth/`):
  - `config.ts` — scopes (`openid`, `email`, `ohs_verified`), TTLs (code 60s, ID
    token 1h, access 15m), `issuerUrl()` (env `OAUTH_ISSUER` → Vercel URL →
    localhost), `discoveryDocument()`, scope parsing + consent copy.
  - `pkce.ts` — S256 derive/verify (constant-time), verifier/challenge validation,
    rejects `plain`. (RFC 7636 test vector covered.)
  - `keys.ts` — loads the RS256 PKCS#8 PEM from `OAUTH_PRIVATE_KEY`; clear
    `OAuthKeyError` (→ 503 `provider_not_configured`) when unset/malformed, never a
    crash. **JWKS publishes PUBLIC-ONLY members** (allow-lists `kty/n/e`, then adds
    `kid`/`alg`/`use`) — a deny-list bug that leaked `d/p/q/dp/dq/qi` was caught in
    runtime smoke-testing and fixed + regression-tested.
  - `tokens.ts` — mints the signed RS256 ID token (claims + `nonce` echo) and a
    short-lived access token via `jose` SignJWT.
  - `claims.ts` — `ohs_verified` computed from the SAME model the directory uses
    (`lib/directory.ts:isFamilyVerified` → `extra.approvalStatus==='approved'` OR
    grandfathered). READ-only; scope-gated emission (no scope ⇒ no claim); a user
    with no signup ⇒ `false` (no false positives).
  - `redirect.ts` — EXACT redirect-URI match (no wildcard/prefix), https-only
    (localhost http for dev), no fragment; registration validate/dedupe.
  - `secrets.ts` — `ppc_live_` client_id + `ppcs_live_` secret (SHA-256 hashed,
    shown once), auth-code gen, constant-time secret compare. Mirrors
    `lib/api-keys.ts`.
  - `authorize.ts` — pure request validator (fatal vs. redirectable errors per
    OAuth §4.1.2.1; PKCE-required-S256; scope capped to client allowlist).
  - `store.ts` — DB ops (raw Neon `sql` like `lib/approval.ts`): register/list/
    rotate clients, authenticate client, issue code (60s TTL), **atomic single-use
    redeem** (`UPDATE ... WHERE used=false AND expires_at>now() RETURNING`).
- **Endpoints:**
  - `GET /.well-known/openid-configuration` — discovery (cacheable, CORS).
  - `GET /.well-known/jwks.json` — public key; 503 when key unset.
  - `GET /oauth/authorize` (`app/oauth/authorize/page.tsx`) — Clerk-gated (bounces
    to `/sign-in?redirect_url=…` when signed out and resumes), validates, renders a
    minimal Allow/Deny consent screen (app name + scope list + Verified-OHS badge +
    a minors heads-up). Consent handled by `actions.ts:decideConsent` (re-validates,
    issues code, redirects with code+state; Deny → `error=access_denied`; fatal →
    `/oauth/authorize/error`). `app/oauth/layout.tsx` gives the dark shell (the
    route lives outside the `(authed)` group; `auth()` reads the session server-side
    so no ClerkProvider is needed there).
  - `POST /api/oauth/token` — client auth (post or basic) → atomic code redeem →
    client/redirect/PKCE binding checks → build claims → mint id_token+access_token.
- **Developers tab:** `oauth-apps-panel.tsx` (client) + `oauth-actions.ts` (server)
  added to `app/(authed)/dashboard/developers/page.tsx` — register an app (name +
  redirect URIs + scopes) → reveal `client_id` + one-time `client_secret`; list the
  caller's apps; rotate secret. Owner-scoped to the Clerk user.
- **Docs:** `docs/sign-in-with-pixelparents.md` — 5-line drop-in snippet, a
  server-side `jose` verify example reading `ohs_verified`, key-gen + env setup,
  security model, and MVP-vs-v1. `.env.example` documents `OAUTH_PRIVATE_KEY` +
  `OAUTH_ISSUER`.
- **Tests (29 new):** PKCE (incl. RFC vector), redirect-URI exact match, authorize
  validator (fatal/redirect/scope-cap), `ohs_verified` claim + scope gating,
  ID-token mint/verify against a generated key + tamper-rejection, client-secret
  hashing, and a JWKS "no private material" regression.
- **Runtime smoke-tested** the built server: discovery doc, JWKS (key-set and
  key-unset 503), token error paths, and `OAUTH_ISSUER` override all verified.

### Potential concerns to address
- **MVP registration is self-serve** (any signed-in user). The design wants an
  **admin-approval gate before an app goes live** (extra scrutiny for apps wanting
  minors' data) — deferred to v1; `oauth_clients.status` already exists to hang it
  on. Flagged in the doc.
- **`sub` is the stable Clerk user id**, not yet pairwise-per-client — cross-app
  correlation is possible until v1 adds pairwise `sub` + HMAC'd `family_id`.
- **No `/userinfo`, refresh tokens, or revocation** in MVP (everything is in the
  ID token; re-login to refresh) — all v1.
- **Single signing key, no rotation runbook** yet (JWKS publishes one key). Quarterly
  rotation w/ prev+current publication is v1.
- **node_modules:** `npm install jose` replaced the worktree's symlinked
  node_modules with a real install (so `next build` runs in-place here). Harmless
  for the worktree; the committed change is just `package.json` + `package-lock.json`.
- The provider trusts Clerk's primary email as verified (Clerk only surfaces
  verified primaries for sign-in) — fine for MVP, worth re-confirming if Clerk
  config changes.

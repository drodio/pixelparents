# Sign in with Pixel Parents

A "Sign in with Google"-style identity button whose differentiator is a **signed,
verified-OHS-identity claim**. After a user signs in, your app receives a
cryptographically signed assertion that they are a verified Stanford OHS student
or parent (`ohs_verified: true`) — something Google, Apple, or GitHub cannot give
you.

This is a thin **OpenID Connect** provider (OAuth 2.0 Authorization Code +
**PKCE S256**) layered on the app's existing Clerk login. Any standard OIDC client
(Auth.js, `openid-client`, `oidc-client-ts`) works against it — or use the
first-party drop-in button / npm SDK below.

> **Status:** MVP. Scopes `openid`, `email`, `ohs_verified`. Self-serve app
> registration in the Developers tab. See **"MVP vs. v1"** at the bottom.

**Three ways to integrate, easiest first:**

| Tier | What | When |
|---|---|---|
| **1. Drop-in `<script>`** | One script tag + a `<div>` with data-attributes. Zero npm, zero build. | You want a branded button in 5 lines. |
| **2. `@pixelparents/auth` npm SDK** | Typed PKCE/state/nonce, authorize-URL builder, token exchange + ID-token verify. | You're on a JS/TS stack and want types + helpers. |
| **3. Any spec-compliant OIDC client** | Point Auth.js / `openid-client` at the discovery doc. | You already have an OIDC stack. |

All three drive the **same** endpoints; the secret-bearing token exchange always
happens **server-side**.

---

## 1. Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /.well-known/openid-configuration` | OIDC discovery document |
| `GET /.well-known/jwks.json` | Public RS256 signing key(s) to verify ID tokens |
| `GET /oauth/authorize` | Authorization + consent screen (Clerk-gated) |
| `POST /api/oauth/token` | Exchange the code (+ PKCE verifier + client secret) for tokens |

The base URL (issuer) is whatever `OAUTH_ISSUER` is set to — e.g.
`https://pixelparents.org`. The examples below use `https://pixelparents.org`.

The discovery document advertises exactly what the provider implements:

```jsonc
{
  "issuer": "https://pixelparents.org",
  "authorization_endpoint": "https://pixelparents.org/oauth/authorize",
  "token_endpoint": "https://pixelparents.org/api/oauth/token",
  "jwks_uri": "https://pixelparents.org/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "code_challenge_methods_supported": ["S256"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "subject_types_supported": ["public"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
  "scopes_supported": ["openid", "email", "ohs_verified"],
  "claims_supported": ["sub", "iss", "aud", "exp", "iat", "nonce", "email", "ohs_verified"]
}
```

---

## 2. Register your app (Developers tab)

In the dashboard, open **Developers → Sign in with Pixel Parents**:

1. Enter an **app name** and one or more **redirect URIs** (exact match required;
   `https://` only, or `http://localhost` for dev).
2. Pick the scopes your app may request (`openid` is always on; add
   `ohs_verified` to get the membership assertion, `email` for the address).
3. On submit you get a **`client_id`** (public) and a **`client_secret`** shown
   **once** — store the secret somewhere safe. You can **rotate** it anytime.

The `client_id` is public (it ships in your front-end button). The
`client_secret` is confidential — it's used **only** in the server-side token
exchange and must never reach the browser.

---

## 3. The flow (what happens)

```
Your app                  Pixel Parents (/oauth/authorize)        Your server (/api/oauth/token)
  │  redirect with PKCE challenge ─▶                                    │
  │                          user signs in via Clerk + clicks Allow     │
  │  ◀─ redirect back: ?code=…&state=…                                  │
  │  POST code + code_verifier + client_secret ───────────────────────▶ │
  │  ◀─ { id_token (signed JWT), access_token, … } ─────────────────────│
  │  verify id_token signature via JWKS, read claims.ohs_verified       │
```

- **PKCE (S256) is required** — generate a `code_verifier`, send
  `code_challenge = BASE64URL(SHA256(verifier))` on `/authorize`, and the raw
  `code_verifier` on `/token`. The `plain` method is rejected.
- **`state`** is echoed back verbatim (CSRF). **`nonce`** is echoed inside the
  ID token (replay protection).
- Auth codes are **single-use** and live **~60 seconds**.
- The token endpoint authenticates a **confidential client** (`client_secret`
  via form body or HTTP Basic), so the exchange must run **server-side**.

---

## 4. Tier 1 — the drop-in `<script>` button (zero npm)

The minimal "as easy as Google" integration. Add the script and a `<div>` with
your `client_id`, `redirect_uri`, and scopes — the script renders the branded
button and runs the PKCE authorize redirect on click.

```html
<script src="https://pixelparents.org/sign-in-with-pixelparents.js" async></script>

<div data-pixelparents-signin
     data-client-id="ppc_live_…"
     data-redirect-uri="https://your-app.com/callback"
     data-scope="openid ohs_verified"></div>
```

That's it for the button. The script generates the PKCE `code_verifier`, `state`,
and `nonce`, stores them in `sessionStorage`, and redirects to `/oauth/authorize`.
After consent the user returns to your `redirect_uri` with `?code=…&state=…`;
finish the flow on your server (section 6).

**Supported `data-` attributes**

| Attribute | Required | Default | Notes |
|---|---|---|---|
| `data-client-id` | ✅ | — | Your public `client_id`. |
| `data-redirect-uri` | ✅ | — | Must exactly match a registered URI. |
| `data-scope` | — | `openid ohs_verified` | Space-delimited; `openid` is added if missing. |
| `data-issuer` | — | `https://pixelparents.org` | Override for self-hosted / preview deploys. |
| `data-theme` | — | light (amber) | `dark` for an amber-on-dark variant. |
| `data-label` | — | `Sign in with Pixel Parents` | Custom button text. |

**Imperative API** (for SPAs / custom elements): the script also exposes
`window.PixelParentsSignIn`:

```js
// Re-scan the DOM after a client-side route change:
window.PixelParentsSignIn.render();

// Or start the flow with no button:
window.PixelParentsSignIn.signIn({
  clientId: "ppc_live_…",
  redirectUri: "https://your-app.com/callback",
  scope: "openid ohs_verified",
});
```

To read the code back on your callback page without the SDK, pull `code`/`state`
from the URL and match `state` against the stored entry
(`sessionStorage["pp_auth:" + state]`), then POST the `code` + that entry's
`codeVerifier` to your server.

---

## 5. Tier 2 — the `@pixelparents/auth` npm SDK

A small typed SDK that owns PKCE/state/nonce, the authorize-URL builder, the
server-side token exchange, and ID-token verification against the JWKS. Source +
full README live in `packages/pixelparents-auth/`.

```bash
npm i @pixelparents/auth
npm i jose   # only needed for server-side verifyIdToken
```

**Browser — start the sign-in and read the callback:**

```ts
import { PixelParentsClient } from "@pixelparents/auth";

const pp = new PixelParentsClient({
  clientId: "ppc_live_…",
  redirectUri: "https://your-app.com/callback",
  scope: ["openid", "ohs_verified"], // issuer defaults to https://pixelparents.org
});

// On your sign-in button → generates PKCE+state+nonce, stores them, redirects:
button.onclick = () => pp.signIn();
// (Popup instead of redirect: pp.signIn({ display: "popup" }))

// On your /callback page:
const { code, request } = pp.handleRedirectCallback(); // verifies state (CSRF)
await fetch("/api/auth/pixelparents/exchange", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code, codeVerifier: request.codeVerifier, nonce: request.nonce }),
});
```

**Server — exchange the code and verify the ID token:**

```ts
import { exchangeCode, verifyIdToken, defaultEndpoints } from "@pixelparents/auth";

const ISSUER = "https://pixelparents.org";
const { tokenEndpoint, jwksUri } = defaultEndpoints(ISSUER);

const tokens = await exchangeCode({
  tokenEndpoint,
  code,
  codeVerifier,
  redirectUri: "https://your-app.com/callback",
  clientId: "ppc_live_…",
  clientSecret: process.env.PP_CLIENT_SECRET!, // server-only
});

const claims = await verifyIdToken({
  idToken: tokens.id_token,
  jwksUri,
  issuer: ISSUER,
  audience: "ppc_live_…",
  nonce, // asserts the ID token's nonce matches the request
});

if (claims.ohs_verified === true) grantAccess(claims.sub, claims.email);
```

The SDK ships unit tests for the PKCE generation (incl. the RFC 7636 test
vector), state/nonce, and the authorize-URL builder. See the package README for
the full API surface and popup-mode details.

---

## 6. Tier 3 — server-side token exchange + reading `ohs_verified` (no SDK)

If you're not on JS, or want to use a standard OIDC client, here's the raw
exchange. On your `/callback` server route, exchange the code and read the claim.
Minimal Node example (uses [`jose`](https://github.com/panva/jose) to verify the
signature against the published JWKS):

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const ISSUER = "https://pixelparents.org";
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

export async function handleCallback(code: string, codeVerifier: string) {
  // 1. Exchange the code (+ PKCE verifier + client credentials) for tokens.
  const res = await fetch(`${ISSUER}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://your-app.com/callback",
      code_verifier: codeVerifier,                  // the PKCE secret from step 4
      client_id: "ppc_live_…",
      client_secret: process.env.PP_CLIENT_SECRET!, // never ship this to the browser
    }),
  });
  const { id_token } = await res.json();

  // 2. Verify the signature + issuer/audience, then read the claim.
  const { payload } = await jwtVerify(id_token, JWKS, {
    issuer: ISSUER,
    audience: "ppc_live_…",
  });

  // 3. THE PRODUCT: a signed assertion of OHS membership.
  if (payload.ohs_verified === true) {
    grantOhsOnlyAccess(payload.sub, payload.email);
  } else {
    showVerifyPrompt();
  }
}
```

Any spec-compliant OIDC client works the same way via the discovery doc — e.g.
**Auth.js** needs no custom flow code:

```ts
// auth.config.ts
providers: [{
  id: "pixelparents",
  name: "Pixel Parents",
  type: "oidc",
  issuer: "https://pixelparents.org",     // discovers the endpoints
  clientId: process.env.PP_CLIENT_ID,
  clientSecret: process.env.PP_CLIENT_SECRET,
  authorization: { params: { scope: "openid email ohs_verified" } },
}]
```

---

## 7. Scopes & claims

| Scope | Claim(s) added | Source |
|---|---|---|
| `openid` | `sub`, `iss`, `aud`, `exp`, `iat`, `nonce` | always |
| `email` | `email`, `email_verified` | Clerk verified primary email |
| `ohs_verified` | `ohs_verified` (boolean) | the OHS verification model (`lib/directory.ts`) |

A decoded ID token looks like:

```jsonc
{
  "iss": "https://pixelparents.org",
  "sub": "user_2abc…",        // stable subject for this user
  "aud": "ppc_live_…",        // your client_id
  "exp": 1751299200, "iat": 1751295600,
  "nonce": "…",               // echoes your request nonce
  "email": "parent@example.com",
  "email_verified": true,
  "ohs_verified": true        // ← the signed verified-OHS assertion
}
```

**How to read each claim**

- **`ohs_verified`** — `true` only when the user is a verified OHS member
  (an admin/student-email-approved family, or a grandfathered pre-cutoff signup),
  computed from the same model the OHS directory uses. An unverified user — or a
  signed-in user with no Pixel Parents signup — gets `ohs_verified: false`, never
  a missing or ambiguous value. **Most apps should request only `openid` +
  `ohs_verified`**: it proves membership while leaking no PII.
- **`email` / `email_verified`** — present only if you requested the `email`
  scope; `email_verified` is always `true` (Clerk only surfaces verified primary
  emails).
- **`sub`** — a stable identifier for the user; use it as your local account key.

> **`role` / `grade_band`** are part of the v1 roadmap (parent/student/alumni and
> a coarsened middle/high grade band) and are **not emitted by the current MVP**.
> When they ship they'll ride dedicated `role` / `student_grade` scopes and a
> richer `claims_supported`; the discovery doc is the source of truth for what a
> given deployment actually emits.

---

## 8. Configuration (operator)

Set two env vars (see `.env.example`):

```bash
# Generate the RS256 signing key:
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out oauth_key.pem
# Then set:
OAUTH_PRIVATE_KEY="<paste the full PEM, BEGIN/END lines included>"
OAUTH_ISSUER="https://pixelparents.org"
```

If `OAUTH_PRIVATE_KEY` is unset, the token + JWKS endpoints return a clear
`provider_not_configured` error (503) instead of crashing.

The drop-in button (`/sign-in-with-pixelparents.js`) is served as a static asset
from `public/`, so it's available at `https://<issuer>/sign-in-with-pixelparents.js`.

---

## 9. Security model

- **Exact redirect-URI match** (no wildcards / prefix matching).
- **PKCE S256 required**; the `plain` method is rejected.
- **Auth codes**: ~60s TTL, single-use (enforced atomically in SQL), bound to the
  client + redirect URI + PKCE challenge + the authenticated user.
- **Client secrets** are stored only as hashes and shown once; the secret is used
  **only** server-side in the token exchange — never put it in the drop-in button
  or any front-end bundle.
- **`state` / `nonce`** for CSRF + replay protection (the SDK + button generate
  and persist these for you; the SDK verifies `state` on the callback and lets you
  verify `nonce` against the ID token).
- No PII or secrets are ever logged or committed.

---

## 10. MVP vs. v1 (deferred)

**In this MVP**
- Scopes `openid`, `email`, `ohs_verified`; everything in the ID token.
- Self-serve registration + secret rotation in the Developers tab.
- One RS256 signing key from env; JWKS endpoint.
- Tier 1 drop-in `button.js` (`public/sign-in-with-pixelparents.js`) +
  Tier 2 `@pixelparents/auth` npm SDK (`packages/pixelparents-auth/`).

**Deferred to v1**
- **Admin-approval gate** before an app goes live (extra scrutiny for apps
  requesting data about minors). MVP registration is self-serve.
- More scopes with privacy coarsening: `profile`, `role` (parent/student/alumni),
  `family_id` (HMAC'd, per-app), `grade_band` (middle/high).
- **Pairwise `sub`** per client so apps can't correlate a user across the
  ecosystem (MVP uses a single stable subject).
- `/userinfo`, **refresh tokens** with rotation + reuse detection, `/oauth/revoke`.
- Remembered consent ("Continue as …") + a Connected-apps revocation panel.
- Signing-key rotation runbook (publish previous + current JWKS).
- Publishing `@pixelparents/auth` to the npm registry (in-repo + buildable today).

# Sign in with Pixel Parents

A "Sign in with Google"-style identity button whose differentiator is a **signed,
verified-OHS-identity claim**. After a user signs in, your app receives a
cryptographically signed assertion that they are a verified Stanford OHS student
or parent (`ohs_verified: true`) — something Google, Apple, or GitHub cannot give
you.

This is a thin **OpenID Connect** provider (OAuth 2.0 Authorization Code +
**PKCE S256**) layered on the app's existing Clerk login. Any standard OIDC client
(Auth.js, `openid-client`, `oidc-client-ts`) works against it.

> **Status:** MVP. Scopes `openid`, `email`, `ohs_verified`. Self-serve app
> registration in the Developers tab. See **"MVP vs. v1"** at the bottom.

---

## 1. Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /.well-known/openid-configuration` | OIDC discovery document |
| `GET /.well-known/jwks.json` | Public RS256 signing key(s) to verify ID tokens |
| `GET /oauth/authorize` | Authorization + consent screen (Clerk-gated) |
| `POST /api/oauth/token` | Exchange the code (+ PKCE verifier) for tokens |

The base URL (issuer) is whatever `OAUTH_ISSUER` is set to — e.g.
`https://pixelparents.org`. The examples below use `https://pixelparents.org`.

---

## 2. Register your app (Developers tab)

In the dashboard, open **Developers → Sign in with Pixel Parents**:

1. Enter an **app name** and one or more **redirect URIs** (exact match required;
   `https://` only, or `http://localhost` for dev).
2. Pick the scopes your app may request (`openid` is always on; add
   `ohs_verified` to get the membership assertion, `email` for the address).
3. On submit you get a **`client_id`** (public) and a **`client_secret`** shown
   **once** — store the secret somewhere safe. You can **rotate** it anytime.

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
  `code_verifier` on `/token`.
- **`state`** is echoed back verbatim (CSRF). **`nonce`** is echoed inside the
  ID token (replay protection).
- Auth codes are **single-use** and live **~60 seconds**.

---

## 4. Tier 1 — the 5-line drop-in (redirect to `/oauth/authorize`)

The minimal "as easy as Google" integration. Generate PKCE, then redirect:

```html
<button id="pp">Sign in with Pixel Parents</button>
<script type="module">
  const b64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem('pp_verifier', verifier);
  const challenge = b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  document.getElementById('pp').onclick = () => {
    const p = new URLSearchParams({
      client_id: 'ppc_live_…', redirect_uri: 'https://your-app.com/callback',
      response_type: 'code', scope: 'openid ohs_verified',
      state: crypto.randomUUID(), nonce: crypto.randomUUID(),
      code_challenge: challenge, code_challenge_method: 'S256',
    });
    location.href = 'https://pixelparents.org/oauth/authorize?' + p;
  };
</script>
```

---

## 5. Tier 3 — server-side token exchange + reading `ohs_verified`

On your `/callback` server route, exchange the code and read the claim. Minimal
Node example (uses [`jose`](https://github.com/panva/jose) to verify the
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
      code_verifier: codeVerifier,                 // the PKCE secret from step 4
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

`ohs_verified` is computed from the same verification model the OHS directory
uses (an admin/student-email-approved family, or a grandfathered pre-cutoff
signup). An unverified user — or a signed-in user with no Pixel Parents signup —
gets `ohs_verified: false`, never a missing or ambiguous value.

---

## 6. Configuration (operator)

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

---

## 7. Security model

- **Exact redirect-URI match** (no wildcards / prefix matching).
- **PKCE S256 required**; the `plain` method is rejected.
- **Auth codes**: ~60s TTL, single-use (enforced atomically in SQL), bound to the
  client + redirect URI + PKCE challenge + the authenticated user.
- **Client secrets** are stored only as SHA-256 hashes and shown once.
- **`state` / `nonce`** for CSRF + replay protection.
- No PII or secrets are ever logged or committed.

---

## 8. MVP vs. v1 (deferred)

**In this MVP**
- Scopes `openid`, `email`, `ohs_verified`; everything in the ID token.
- Self-serve registration + secret rotation in the Developers tab.
- One RS256 signing key from env; JWKS endpoint.

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
- An `@pixelparents/auth` npm SDK + a hosted `button.js` drop-in.
```

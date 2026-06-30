# @pixelparents/auth

**Sign in with Pixel Parents** — a tiny OpenID Connect client SDK (OAuth 2.0
Authorization Code + **PKCE S256**). Its differentiator: after sign-in your app
receives a cryptographically signed **`ohs_verified`** claim — proof that the
user is a verified Stanford OHS student or parent, something Google, Apple, or
GitHub can't give you.

- **Zero crypto to hand-roll** — PKCE, `state`, and `nonce` are generated for you
  with Web Crypto (works in the browser, Node 18+, Deno, and edge runtimes).
- **Browser half**: build the authorize URL, redirect or popup, read the code on
  your callback.
- **Server half**: exchange the code for tokens and verify the ID token's
  signature against the published JWKS — `ohs_verified === true` is then a
  trustworthy assertion.

> The token exchange needs your **client secret**, so it must run on a server.
> The SDK keeps the secret-bearing call (`exchangeCode`) separate from the
> browser helpers by design.

## Install

```bash
npm i @pixelparents/auth
# Only needed for server-side ID-token verification:
npm i jose
```

## Quick start

### 1. Browser — start the sign-in

```ts
import { PixelParentsClient } from "@pixelparents/auth";

const pp = new PixelParentsClient({
  clientId: "ppc_live_…",
  redirectUri: "https://your-app.com/callback",
  // issuer defaults to https://pixelparents.org
  scope: ["openid", "ohs_verified"],
});

// On your "Sign in" button:
document.getElementById("signin")!.onclick = () => pp.signIn();
// → generates PKCE + state + nonce, stores them in sessionStorage,
//   and redirects to /oauth/authorize. After consent the user comes
//   back to your redirect_uri with ?code=…&state=…
```

### 2. Browser — read the code on your callback page

```ts
import { PixelParentsClient } from "@pixelparents/auth";

const pp = new PixelParentsClient({
  clientId: "ppc_live_…",
  redirectUri: "https://your-app.com/callback",
});

const { code, request } = pp.handleRedirectCallback();
// Verifies `state` against what we stored (CSRF protection) and hands you
// `request.codeVerifier` + `request.redirectUri`. POST these to YOUR server —
// never do the token exchange in the browser (it needs the client secret).
await fetch("/api/auth/pixelparents/exchange", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ code, codeVerifier: request.codeVerifier, nonce: request.nonce }),
});
```

### 3. Server — exchange the code and verify the ID token

```ts
import { exchangeCode, verifyIdToken, defaultEndpoints } from "@pixelparents/auth";

const ISSUER = "https://pixelparents.org";
const { tokenEndpoint, jwksUri } = defaultEndpoints(ISSUER);

export async function POST(req: Request) {
  const { code, codeVerifier, nonce } = await req.json();

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

  // THE PRODUCT: a signed assertion of OHS membership.
  if (claims.ohs_verified === true) {
    // grant access; claims.sub is the stable user id, claims.email if scoped
  }
  return Response.json({ ohsVerified: claims.ohs_verified === true });
}
```

## Popup mode

```ts
// Opener:
const result = await pp.signIn({ display: "popup" }); // resolves with { code, request }

// On your callback page, forward the result back to the opener and close:
import { postCallbackToOpener } from "@pixelparents/auth";
postCallbackToOpener();
```

## Scopes & claims

| Scope          | Claim(s)                    | Meaning                                                        |
| -------------- | --------------------------- | ------------------------------------------------------------- |
| `openid`       | `sub`, `iss`, `aud`, …      | Required for any OIDC request.                                 |
| `email`        | `email`, `email_verified`   | The user's verified email.                                    |
| `ohs_verified` | `ohs_verified` (boolean)    | **Signed assertion of verified Stanford OHS membership.**     |

`ohs_verified` is computed from the same verification model the OHS directory
uses. An unverified user — or a signed-in user with no Pixel Parents signup —
gets `ohs_verified: false`, never a missing or ambiguous value.

## API surface

- `new PixelParentsClient(opts)` — `signIn()`, `createAuthorizeRequest()`,
  `handleRedirectCallback()`, `getEndpoints()`.
- `generatePkcePair()`, `generateState()`, `generateNonce()`,
  `deriveS256Challenge()`, `randomUrlSafe()`.
- `buildAuthorizeUrl()`, `normalizeScope()`.
- `exchangeCode()`, `verifyIdToken()`, `decodeJwtUnsafe()`.
- `defaultEndpoints()`, `fetchEndpoints()` (discovery), `normalizeIssuer()`.
- `OAuthError`, `MVP_SCOPES`, and all types.

## Standards / interop

The SDK targets the live Pixel Parents OIDC provider, which is spec-compliant:
any standard OIDC client (Auth.js, `openid-client`, `oidc-client-ts`) also works
via `GET https://pixelparents.org/.well-known/openid-configuration`. Use this SDK
when you want the smallest possible integration with first-class `ohs_verified`
typing.

## Develop

```bash
npm run build      # tsc → dist/ (ESM + .d.ts)
npm test           # vitest (PKCE vectors, state/nonce, authorize-URL builder)
npm run typecheck
```

## License

MIT

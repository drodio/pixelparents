## Progress Update as of [June 30, 2026 — 1:42 PM Pacific]

### Summary of changes since last update
First entry. Built the developer-facing **"Sign in with Pixel Parents"** drop-in
button + npm SDK + expanded docs — the Google-like, easy-integration layer over
the already-merged public OIDC endpoints. Everything here uses only the PUBLIC
OIDC surface (`/oauth/authorize`, `/api/oauth/token`,
`/.well-known/openid-configuration`, `/.well-known/jwks.json`), so it's
independent of server internals. No changes to `lib/oauth/*`, `app/oauth/*`,
`app/api/oauth/*`, or any other restricted path.

### Detail of changes made:
- **Tier 1 drop-in button** — `public/sign-in-with-pixelparents.js`. A hosted,
  dependency-free, no-build script served statically by Next 16 from `public/`.
  A developer drops a `<script>` tag + a `<div data-pixelparents-signin …>` with
  `data-client-id` / `data-redirect-uri` / `data-scope` (+ optional
  `data-issuer` / `data-theme=dark` / `data-label`). It renders the branded
  amber/dark button with an inline pixel-mascot SVG mark and, on click, runs the
  Authorization Code + PKCE (S256) + state/nonce redirect to `/oauth/authorize`.
  PKCE/state/nonce are stored in `sessionStorage` under `pp_auth:<state>`.
  Exposes `window.PixelParentsSignIn.{render, renderElement, signIn}` for SPAs.
  Verified its S256 derivation against the RFC 7636 Appendix B test vector.
- **Tier 2 npm SDK** — `packages/pixelparents-auth/` (`@pixelparents/auth`, ESM,
  own `package.json`/`tsconfig`/`vitest.config`/README). Modules:
  - `pkce.ts` — Web Crypto PKCE (`generatePkcePair`, `deriveS256Challenge`,
    `generateState`/`generateNonce`, `randomUrlSafe`). Works in browser, Node
    18+, Deno, edge.
  - `authorize-url.ts` — `buildAuthorizeUrl` (forces `response_type=code` +
    `code_challenge_method=S256`) and `normalizeScope` (always includes
    `openid`, dedupes).
  - `endpoints.ts` — `defaultEndpoints(issuer)` derives the live path layout;
    `fetchEndpoints` does real discovery (`discover: true`).
  - `token.ts` — `exchangeCode` (server-side, carries `client_secret` via
    `client_secret_post`), `verifyIdToken` (RS256 + JWKS via dynamically-imported
    `jose`, checks iss/aud/exp + nonce), `decodeJwtUnsafe` (debug only).
  - `browser.ts` — `PixelParentsClient` (`signIn` redirect|popup,
    `createAuthorizeRequest`, `handleRedirectCallback` with state/CSRF check,
    sessionStorage persistence) + `postCallbackToOpener` for popup mode.
  - `types.ts` — scope/claim vocabulary, `IdTokenClaims`, `TokenResponse`,
    `OAuthError`.
  - Tests: `pkce.test.ts` + `authorize-url.test.ts` (16 tests, incl. the RFC
    7636 vector). Built to `dist/` with `.d.ts` via its own tsc.
- **Tier 3 docs** — rewrote `docs/sign-in-with-pixelparents.md` to cover all
  three tiers: the 5-line drop-in snippet + its `data-` attribute table, the SDK
  browser+server usage, the full Authorization-Code+PKCE flow, the
  scopes/claims table with how to read `ohs_verified` (and a forward-looking note
  on v1's `role` / `grade_band`), a server-side `jose` verify example, and an
  Auth.js zero-custom-code config via the discovery doc.
- **Root `tsconfig.json`** — added `"packages"` to `exclude` so the app's
  `tsc --noEmit` doesn't try to compile the browser-targeted SDK (which has its
  own tsconfig + `jose`). This is the only change outside the new dirs.

### Validation run:
- `npx tsc --noEmit` (app) — clean.
- `npm run lint` — clean (0 errors, 0 warnings).
- `npm test` (app) — 471/471 pass. SDK `vitest run` — 16/16 pass.
- SDK `tsc -p` build — clean, emits `dist/` + `.d.ts`.
- `npm run build` — the symlinked `node_modules` in this worktree trips
  Turbopack ("Symlink node_modules ... points out of the filesystem root"), the
  known worktree gotcha. Verified the build by copying the changes into the main
  checkout (real node_modules) and running `next build` there — it succeeded
  (all routes compiled, `packages/` correctly excluded, the static button file
  served) — then restored the main checkout to clean.

### Potential concerns to address:
- Accuracy vs. the live MVP: the provider currently emits only `openid` /
  `email` / `ohs_verified`, `subject_types_supported: ["public"]`, and has no
  `/userinfo` or `/revoke`. The SDK + docs are grounded on exactly that; `role`/
  `grade_band` are documented as v1-deferred, not emitted. If the provider's
  scope/claim set changes, update `types.ts` `MVP_SCOPES` + the docs table.
- The SDK is in-repo and buildable but NOT published to npm (per the task). If/
  when publishing, the `jose` peer dep + `publishConfig.access=public` are
  already set.
- `dist/` is gitignored in the package; the SDK is shipped as source + build
  script, not prebuilt artifacts.
- Build verification was done by copy-into-main (worktree symlink limitation),
  not in the worktree itself — re-confirm on CI / a non-symlinked checkout.

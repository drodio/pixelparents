## Progress Update as of 2026-06-12 (afternoon Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Built the NFX token one-click refresh (Option B+) so the expiring NFX
Signal JWT can be renewed without DevTools or a redeploy.

### Detail of changes made:
- **Why this design:** NFX uses Auth0 **implicit flow** (no refresh token), and the
  Auth0 **password grant returned 401 access_denied** for the public SPA client — so
  neither a refresh-token call nor a headless password login works. The token is held
  in-memory (not localStorage), renewed silently via the Auth0 SSO cookie. So the
  refresh has to ride the user's live browser session.
- **Token now DB-first:** `src/lib/nfx-token-store.ts` (`getNfxToken`/`setNfxToken`/
  `getNfxTokenUpdatedAt`) reads the JWT from the existing **`app_settings`** kv table
  (key `nfx_signal_token`), env var `NFX_SIGNAL_TOKEN` as seed/fallback. Reused
  app_settings (added on main by #—, migration 0057) — NO new table/migration.
- **`[nfx]` enricher** (`enrichers/nfx.ts`): `nfxGraphql` now takes the token as a
  param; `enrichWithNfx` resolves it once via `getNfxToken()`. Graceful empty on no token.
- **Refresh endpoint** `POST /api/admin/nfx-token`: secret-authed
  (`NFX_TOKEN_REFRESH_SECRET`, constant-time compare), validates the JWT (readable +
  future exp via `getTokenExpiry`), stores it. CORS scoped to `https://signal.nfx.com`
  + OPTIONS preflight. NOT Clerk-authed (bookmarklet is cross-origin, can't carry the cookie).
- **Admin page** `/admin/nfx-refresh` (super-admin only): shows token status + a
  draggable **bookmarklet** (rendered via dangerouslySetInnerHTML since React strips
  `javascript:` hrefs). The bookmarklet patches `fetch`/`XHR.setRequestHeader`, grabs
  the next `Authorization: Bearer <JWT>` Signal sends, POSTs it to the endpoint;
  dispatches focus/visibilitychange to trigger a refetch; 9s timeout w/ guidance.
- **`jwt-check` cron**: now checks the live (DB-first) token + links the one-click page
  instead of DevTools instructions.
- Env: `NFX_TOKEN_REFRESH_SECRET` added to `.env.local` + Vercel **Prod + Dev**
  (Preview pending — CLI 53.1.0 loops on the non-interactive preview add). Unused
  password-grant creds were NOT stored (B+ needs no NFX password).
- Tested live (dev DB): store roundtrip ✓, endpoint valid→200+CORS / wrong-secret→403 /
  expired→400 / junk→400, OPTIONS→204. tsc clean.

### Potential concerns to address:
- **`app_settings` must exist on PROD** (migration 0057) for `setNfxToken` to work.
  `getNfxToken` falls back to env if absent, so scoring is safe, but the refresh
  endpoint returns `store_failed` until 0057 is applied to prod. VERIFY/APPLY 0057 on prod.
- Bookmarklet token capture depends on the Signal SPA making a request after the patch
  (focus/visibility trigger + active session). Failure path is graceful (alert: click
  around + retry). If it proves flaky, fall back to a silent-authorize iframe (needs
  the exact Auth0 redirectUri, which didn't extract cleanly from the minified bundle).
- NFX Auth0 facts (for future work): tenant `nfxsignal-production.auth0.com` / custom
  domain `auth.nfx.com`, SPA client_id `Vi2Ewo0nW6flKQzO0NBc8E0YveBjjKlU`, implicit flow.

## Progress Update as of 2026-06-12 (afternoon Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
Fixed the NFX refresh bookmarklet (#383). The original network-interception approach
NEVER fired (the NFX app captures `fetch` at load, before any bookmarklet can patch it
— live console test showed `xhr=0 fetch=0`). Rewrote it to read the token straight from
a cookie, which is reliable.

### Detail of changes made (verified live via DROdio's console):
- NFX stores its session JWTs in **non-httpOnly cookies** readable from `document.cookie`:
  - `SIGNAL_ACCESS_JWT` — Auth0 access token, `aud=[auth0/api/v2, /userinfo]`, **~24h** expiry.
  - `SIGNAL_ID_JWT` — OIDC id token, `aud=<client_id>`, **~6-month** expiry.
- Tested BOTH against `signal-api.nfx.com/graphql` (`query{__typename}`): **both return HTTP 200**.
  Chose **`SIGNAL_ID_JWT`** — it authenticates AND lasts ~6 months, so the bookmarklet is
  clicked ~twice a year instead of daily. (The user's recurring breakage was almost certainly
  from copying the short-lived ACCESS token via DevTools; the cron's 14-day warning fits the
  6-month id token.)
- `buildBookmarklet` now: `document.cookie.match(/SIGNAL_ID_JWT=([^;]+)/)` → POST to
  `/api/admin/nfx-token`. No interception, no scroll/focus tricks, no 9s timeout. Must run on
  a signal.nfx.com tab (cookie is per-domain). Updated the page instructions + comments.
- The endpoint / store / enricher are unchanged from #383 (already validate JWT + future exp,
  store in `app_settings`, read DB-first). `app_settings` confirmed present on prod.

### Potential concerns to address:
- If NFX ever marks `SIGNAL_ID_JWT` httpOnly or renames it, the cookie read breaks — the
  bookmarklet alerts "No NFX session found." Fallback would be the Auth0 silent-authorize
  iframe (tenant `nfxsignal-production.auth0.com`, client `Vi2Ewo0nW6flKQzO0NBc8E0YveBjjKlU`).
- signal-api accepted the id token for `__typename`; real scraper queries
  (InvestorsAutocompleteQuery / InvestorProfileLoad) should be confirmed on the first real
  re-score after a refresh (auth gate is binary "signed in", so very likely fine).

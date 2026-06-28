# sms-error-alerts — Text the operator on production server errors

## Progress Update as of 2026-06-05 10:48 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Production server errors now text the operator (Twilio SMS) **in addition to** the existing email alert, riding the same 1-hour dedup gate so an error storm can't spam. Design = Option A from the brainstorm: extend the app's own `reportServerError` path rather than wiring a PostHog webhook. Scope is deliberately small — operator parity with the email alert, no severity tiers, no user-facing texts.

### Detail of changes made:
- **`src/lib/sms.ts` (new):** thin Twilio sender, no SDK — a single `fetch` to `…/Messages.json` with HTTP Basic auth (Account SID + Auth Token). `smsConfigured()` is true only when `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` + `ADMIN_ALERT_PHONE` are all set; otherwise `sendAdminSms()` is a silent no-op (so dev/preview with test creds and no recipient never send). Throws on non-2xx so a misconfig surfaces in logs. This commits us to **basic auth**, so the stray `TWILIO_API_KEY_SID` Vercel var can be pruned.
- **`src/lib/report-server-error.ts`:** email + SMS are now independent channels sharing ONE dedup gate. Computes `emailOn = alertConfigured()` and `smsOn = smsConfigured()`; returns early only if neither is on; runs the fingerprint dedup once; sends the SMS (when `smsOn`) then the email (when `emailOn`). SMS body: `🔴 festival prod: <ErrName>: <msg≤100 chars> — <route>` (route appended after truncation so it's never dropped). SMS send is awaited-but-caught so it can't break the request, mirroring the email.
- **`tests/lib/sms.test.ts` (new):** 7 vitest cases — `smsConfigured` gating (all-or-nothing), no-op-without-config, correct Twilio endpoint + Basic auth header + `To/From/Body` form body, explicit `to` override, and throw-on-non-2xx. Mirrors the `anymailfinder.test.ts` fetch-stub style. All green.
- **`.env.example`:** added `TWILIO_FROM_NUMBER` and `ADMIN_ALERT_PHONE` to the SMS section with comments.

### Operational state / follow-ups:
- **Needs a recipient to actually fire:** `ADMIN_ALERT_PHONE` is NOT yet set in Vercel or `.env.local`. Until DROdio provides a cell number and it's added to Production, `smsConfigured()` is false and prod sends email-only (no regression). `TWILIO_FROM_NUMBER` already exists in Vercel (Preview, Production) from the earlier setup, so the recipient is the only missing piece.
- Coverage equals today's email alerts — i.e. only errors that flow through `reportServerError` call sites. Uncaught errors that only reach PostHog via `onRequestError` are NOT texted. Broadening that = Option B (PostHog alert → webhook), deferred.
- Rotate the live Twilio auth token (shared in chat during setup) when convenient; see [[twilio-credentials-state]] in memory.

### Potential concerns to address:
- Dedup is in-memory per serverless instance (inherited from the email path) — a cold start can produce one extra alert. Acceptable; documented in the file header.
- `TWILIO_API_KEY_SID` in Vercel is now unused (we chose basic auth) — prune to avoid future confusion.

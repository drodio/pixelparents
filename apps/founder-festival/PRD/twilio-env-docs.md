# twilio-env-docs — Document Twilio SMS env vars

## Progress Update as of 2026-06-05 10:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Documented the Twilio SMS credentials in `.env.example` and provisioned the real values in Vercel's env store + local `.env.local`. No application code change — there is still no Twilio client in `src/` yet; this is credential/config plumbing ahead of an SMS feature.

### Detail of changes made:
- `.env.example` now lists `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` (names only) with a comment explaining the per-environment value pattern: same var names everywhere, **live** values in Production, **test** values in Preview + Development + local `.env.local`, so non-prod runs never send real SMS.
- Vercel env store (set via CLI this session): `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` → live in Production, test in Preview and Development. Local `.env.local` got the test SID + token.
- Pre-existing Twilio vars from ~2h earlier were left untouched: `TWILIO_API_KEY_SID` and `TWILIO_FROM_NUMBER` (both scoped Preview, Production). We had no new values for those, and `TWILIO_FROM_NUMBER` is required to actually send SMS.

### Potential concerns to address:
- **Naming reconciliation:** the project now carries two auth styles — basic (`ACCOUNT_SID` + `AUTH_TOKEN`, just set authoritatively) and API-key (`TWILIO_API_KEY_SID`, pre-existing). Whoever builds the Twilio client should pick ONE and prune the other so it's unambiguous. `.env.example` currently documents only the basic pair.
- `TWILIO_FROM_NUMBER` is not yet in `.env.example` (value-unknown, pre-existing) — add it when the SMS integration lands.
- **Security:** the live auth token was shared in a chat transcript during setup; rotate it in the Twilio console and re-run the single Production `vercel env add` when convenient.
- Vercel env var changes only take effect on the next deploy; no redeploy is required for behavior today since no code reads these yet.

# External-call timeouts — external-call-timeouts
## Progress Update as of 2026-06-10 — Reliability (Sprint 2)
*(Most recent updates at top)*

### Summary of changes since last update
Added wall-clock timeouts to the standalone external integrations that weren't
otherwise time-boxed, so a hung third-party API can't stall a request or cron run.

### Detail of changes made:
- New `src/lib/fetch-timeout.ts` — `fetchWithTimeout(url, init, timeoutMs?)` via
  AbortController (mirrors the enrichers/neo.ts pattern). Default 15s
  (`EXTERNAL_FETCH_TIMEOUT_MS`). TDD: 3 tests (passthrough, abort-on-timeout,
  init preserved).
- Migrated the UNPROTECTED callers: luma, sms (Twilio), anymailfinder, icon-blob
  (Blob image fetch), chief (×2), brightdata (×4). The BrightData snapshot
  DOWNLOAD gets 30s (larger payload than the quick trigger/progress calls).
- NOT touched: the per-source enricher fetches already run through
  runEnrichments' `withEnricherTimeout` (Promise.race, 15s default / per-source
  overrides), and exa.ts uses the exa-js SDK (not raw fetch).

### Potential concerns to address:
- The Promise.race enricher timeouts protect the CALLER but don't abort the
  underlying socket; migrating enrichers to fetchWithTimeout too would add that as
  defense-in-depth (optional follow-up).

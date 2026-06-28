# External-call timeouts — follow-up (external-timeouts-followup)

## Progress Update as of 2026-06-14 — close out app-wide coverage
*(Most recent updates at top)*

### Summary of changes since last update
Wrapped the last standalone external calls that the original timeouts PR (#364)
didn't cover, so every server-side external `fetch` is now either time-boxed by
`fetchWithTimeout` or already bounded by the enricher `withEnricherTimeout` race.

### Detail of changes made:
- **src/lib/posthog-query.ts** — `phQuery` (daily-metrics digest cron) now uses
  `fetchWithTimeout` with a generous 30s budget (HogQL aggregations over large
  event volumes can run longer than the 15s default).
- **src/lib/spend/vercel-ai-gateway.ts** — `getVercelCredits` (spend dashboard)
  wrapped at the default 15s.
- **src/app/api/account/family/[id]/photo/route.ts** — the photo-proxy GET wraps
  its upstream blob fetch. Safe for streaming: `fetchWithTimeout` clears its timer
  the moment headers arrive (in the `finally` after `fetch()` resolves), so the
  `upstream.body` stream is never aborted mid-flight — it only bounds TTFB.
- **src/app/api/cron/refresh-mm/route.ts** — the Majestic Million CSV download
  wraps its fetch. Same TTFB-only semantics: the large `arrayBuffer()` body
  download is not cut off (timer already cleared once headers land).
- **.env.example** — carried forward hand-edits (regen comment, METRICS_EXCLUDE_EMAILS,
  3am digest correction) plus the keys reconciled in #362.

### Potential concerns to address:
- `fetchWithTimeout` bounds connect/time-to-first-byte, NOT total body-download
  time (by design — it clears the timer once headers arrive). A connection that
  stalls *mid-body* on the MM CSV or photo stream is still unbounded; acceptable
  for now (content-length-bounded, low frequency).

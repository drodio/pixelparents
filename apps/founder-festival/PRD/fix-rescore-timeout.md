## Progress Update as of 2026-06-05 07:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fix for the "Network error" on rescoring heavy profiles (Patrick Collison).
Root cause: `/api/rescore` (and `/api/eval`) capped at `maxDuration = 60`; a
high-presence profile that escalates to Opus — made slower by the sequential HTTP
calls my recent HN identity-resolution work added — exceeds 60s, Vercel kills the
function, the response isn't JSON, `res.json()` throws, and the client catch
shows a bare "Network error".

### Detail of changes made:
- `src/app/api/rescore/route.ts` + `src/app/api/eval/route.ts`: `maxDuration`
  60 → 180 (Vercel allows up to 300; the scoring-tick cron already uses 300).
- `src/lib/enrichers/hackernews.ts`: parallelized the two sequential fetch loops
  in `resolveHnHandle` — the derived-candidate probes (was up to 6 sequential
  round-trips) and the content-discovery author lookups (up to 5) now run via
  `Promise.all`. Cuts the latency my identity tiers added.
- tsc clean; the 14 HN unit tests still pass. Doc: a "verified accurate / perf"
  changelog line (no scoring change).

### Potential concerns to address:
- Couldn't pull live Vercel logs from this worktree (the `.vercel` link is stale
  here), but the failure mechanism is confirmed from the client code + route
  config. If heavy profiles still approach 180s, the next lever is trimming the
  enricher mesh or the Opus pass, not raising the cap further.
- resolveHnHandle still runs once per HN enricher AND once per Tokenmaxxing
  enricher (parallel, so no added wall-time now that internal fetches are
  parallel) — could share one resolution if we want to cut API load.

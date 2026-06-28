# Build hygiene — build-hygiene
## Progress Update as of 2026-06-14 — rebase onto main, re-reconcile
*(Most recent updates at top)*

### Summary of changes since last update
Rebased onto a much-advanced main (64 commits: docs/events/support shipped).
Removing the `scripts/**` typecheck exclude newly subjected main's added scripts
to tsc, surfacing one latent error; also re-reconciled `.env.example` against
env keys main introduced.

### Detail of changes made:
- **Fixed scripts/seed-docs.ts** (added by main): `(res.rows ?? res)` tripped
  TS2339 because neon `sql.query()` types as `Record<string,any>[]`. Applied the
  same `as unknown as { rows?: unknown[] }` cast idiom used in the other scripts.
  `tsc --noEmit` (incl. scripts/) back to 0.
- **.env.example second pass**: added `NFX_TOKEN_REFRESH_SECRET` (admin
  /admin/nfx-refresh gate), and the server-side PostHog read keys
  (`POSTHOG_SECRET`/`POSTHOG_PROJECT_ID`/`POSTHOG_API_HOST`) +
  `METRICS_DIGEST_EMAIL` for the daily-metrics digest cron — all real app config
  that main relies on but was undocumented. Also documented
  `EXTERNAL_FETCH_TIMEOUT_MS` here (next to `ENRICHER_TIMEOUT_MS`) so .env.example
  stays single-owner — the consuming code lands via the external-call-timeouts PR.

### Potential concerns to address:
- scripts/ is now CI-gated: future scripts with type errors block typecheck — as
  this rebase already demonstrated. Good (intended), but expect occasional churn.

## Progress Update as of 2026-06-10 — audit governance/hygiene
*(Most recent updates at top)*

### Summary of changes since last update
Wired scripts/ into the typecheck gate and reconciled .env.example with the env
keys actually used in code.

### Detail of changes made:
- **scripts/ now typechecked**: removed `scripts/**/*` from tsconfig `exclude`.
  Fixed the only 3 errors: two NeonHttpQueryResult casts (`as unknown as {rows}`)
  in dedupe-apply-12 / dedupe-cleanup, and a `@ts-expect-error` on the typeless
  `pngjs` import in remove-logo-bg. Full `tsc --noEmit` (now incl. scripts) = 0.
- **.env.example reconcile**: added the ~22 user-configurable keys used in code
  but undocumented — enricher creds (BrightData, EnrichLayer, Google KG, Kaggle,
  Libraries.io, USPTO, Chief, ENRICHER_TIMEOUT_MS), API/admin/claim rate limits,
  and a new Storage/inbound section (BLOB_READ_WRITE_TOKEN,
  RESEND_INBOUND_SIGNING_SECRET, CLAIM_REPLY_TO). Platform-injected vars
  (VERCEL_ENV/NEXT_RUNTIME/POSTGRES_URL*) and script knobs (APPLY_DB_URL/LIMIT/
  CONCURRENCY) intentionally remain out of the keyed list (noted instead).

### Potential concerns to address:
- scripts/ is now CI-gated: a future script with a type error blocks typecheck.

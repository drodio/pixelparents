# Branch: `posthog-observability` — PostHog error tracking + analytics

Motivated by the Neon data-transfer-quota outage (2026-05-27): prod was fully
down (500s everywhere) and we only noticed by chance — there was **no error
tracking and no error boundary**. This wires PostHog so a future outage shows up
(and can alert) instead of going silent.

## Progress Update as of 2026-05-27 11:47 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Integrated PostHog manually (not the wizard — it failed on a full disk, and this
is a customized Next 16 + Clerk setup). Read the bundled Next 16 instrumentation
docs first per AGENTS.md. The key piece is **server-side error capture via
`onRequestError`**, which would have surfaced the 500-storm. All code no-ops
cleanly until `NEXT_PUBLIC_POSTHOG_KEY` is set.

### Detail of changes made:
- `src/instrumentation.ts` — `register()` + `onRequestError` → `posthog-node`
  `captureException` (Node runtime only; pulls distinct_id from the ph cookie;
  flushes immediately for serverless). **The outage alarm.**
- `src/lib/posthog-server.ts` — `getPostHogServer()` singleton (returns null when
  unconfigured, flushAt 1 / flushInterval 0).
- `src/instrumentation-client.ts` — `posthog-js` init: autocapture + pageviews +
  client exception capture; `person_profiles: 'identified_only'`; **session
  replay OFF** by default.
- `src/app/global-error.tsx` — root error boundary (we had none) → captures React
  render crashes to PostHog + a dark-theme recovery UI.
- `src/components/PostHogIdentify.tsx` — Clerk `useUser` → `posthog.identify`
  (resets on sign-out); mounted in `(authed)/layout.tsx` inside ClerkProvider.
- deps: `posthog-js`, `posthog-node`.

### Required env (NOT committed — DROdio to set):
- `NEXT_PUBLIC_POSTHOG_KEY` = PostHog project API key (public token)
- `NEXT_PUBLIC_POSTHOG_HOST` = `https://us.i.posthog.com` (or `eu.i.posthog.com`)
- Set in `.env.local` (local) AND Vercel **production** env. Until set, PostHog
  is inert.

### Deferred / recommended follow-ups:
- **Set a PostHog alert** on the `$exception` event / error-tracking volume so an
  outage pages you (the whole point of this).
- **Source maps** via `posthog-cli` in the Vercel build → readable client stack
  traces (server stacks are already real).
- **Reverse proxy** (`/ingest` rewrite in next config) → dodges ad-blockers for
  analytics. Skipped in v1 to limit risk on the custom Next 16.
- **Session replay** — currently disabled; enable + sample when ready.

### Potential concerns to address:
- Disk was 100% full (the wizard's failure); freed npm/pnpm caches to ~4.2 GB.
  The 5 running Next dev servers' `.next` dirs (~5.7 GB) are the real hog — stop
  unused ones to reclaim space.
- `capture_exceptions`/`capture_pageview` option names assumed current for the
  installed posthog-js; verify in the PostHog dashboard that events arrive once
  the key is set.

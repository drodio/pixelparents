## Progress Update as of [June 30, 2026 — 9:02 PM Pacific]

### Summary of changes since last update
First entry for this branch. Shipped two features: (1) replaced the static
`app/opengraph-image.png` + `app/twitter-image.png` social cards with DYNAMIC
`ImageResponse` route handlers that render at request time from live `getStats()`
data, so the family count is always current; (2) wired up PostHog product
analytics via a client provider mounted in the root layout, config read from env
only, no-op without a key. tsc/lint/tests all clean (773 tests pass).

### Detail of changes made:
- **Feature 1 — dynamic social card:**
  - New `app/opengraph-image.tsx`: `next/og` `ImageResponse`, 1200×630, near-black
    `#0A0A0B` bg, amber `#F5B301` accents, rounded amber "P" logo + "Pixel Parents"
    wordmark, headline "Parents helping OHS students build what they wish
    existed.", live line "Join {families} families building together." and footer
    `pixelparents.org`. Uses system fonts (no font file needed).
  - Reads `getStats().total_families` (completed-only counts). Wrapped in
    try/catch → falls back to no-number copy ("Join families building together.")
    on ANY error, and also omits the number when count is 0/null. The card can
    never fail to render.
  - `runtime = "nodejs"` (Neon HTTP driver), `dynamic = "force-dynamic"` +
    `revalidate = 0` so every scrape recomputes from live data (no caching).
  - New `app/twitter-image.tsx` re-exports everything from opengraph-image (single
    source of truth for design + count).
  - DELETED `app/opengraph-image.png` + `app/twitter-image.png`. `app/icon.png`
    left untouched.
  - CAVEAT (documented in PR): social platforms cache the OG image they scrape;
    the newest number surfaces to a given platform only on (re-)share / re-scrape.
- **Feature 2 — PostHog analytics:**
  - `npm install posthog-js` (^1.396.3) — package.json + package-lock committed.
  - New `components/posthog-provider.tsx` (client): inits `posthog-js` from
    `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` (default
    `https://us.i.posthog.com`). GUARD: if the key is absent it is a complete
    no-op. `capture_pageview:false` + manual `$pageview` on route change
    (`usePathname` + `useSearchParams` in an effect, wrapped in `<Suspense>` per
    PostHog's App Router guide), autocapture enabled, `capture_pageleave:true`,
    `respect_dnt:true`.
  - `app/layout.tsx`: mounts `<PostHogProvider />` once inside `<body>` after
    children. Existing metadata/viewport/manifest/sw-register untouched.
  - `.env.example`: documented `NEXT_PUBLIC_POSTHOG_KEY` +
    `NEXT_PUBLIC_POSTHOG_HOST` placeholders (no real values).

### Potential concerns to address:
- `next build` was NOT run in this worktree (node_modules was symlinked; npm
  materialized it during install). tsc `--noEmit`, eslint, and vitest (773
  passing) are all clean. The OG route + PostHog pageviews should be sanity-checked
  on a Vercel preview once the env vars are set.
- The dynamic OG image adds a DB round-trip per scrape; getStats() has a fast
  single-round-trip path and degrades gracefully, so this is low-risk.
- Analytics is dormant until `NEXT_PUBLIC_POSTHOG_KEY` is set in Vercel env
  (project 492937, US cloud). No key committed anywhere.
- Owned-files scope respected: only opengraph/twitter images, layout.tsx,
  posthog-provider.tsx, package.json, package-lock.json, .env.example touched.

# Branch: `vercel-analytics` — progress log

## Progress Update as of 2026-05-27 (Pacific)
*(Most recent updates at top)*

### Summary of changes since last update
Added Vercel Web Analytics: installed `@vercel/analytics` and mounted the
`<Analytics />` component in the root layout so page views are tracked across
App Router navigations.

### Detail of changes made:
- `pnpm add @vercel/analytics` → `@vercel/analytics@2.0.1` (used pnpm, not `npm i`,
  to keep `pnpm-lock.yaml` consistent — the Vercel docs show npm).
- `src/app/layout.tsx`: `import { Analytics } from "@vercel/analytics/next"` and
  `<Analytics />` rendered inside `<body>` after `{children}`. The `/next` export
  auto-tracks route changes via the Next router (Next 16.2.6).
- No env var or config needed in code. tsc + eslint clean.

### Potential concerns to address:
- **Dashboard toggle required**: Web Analytics must be enabled in the Vercel
  project (Project → Analytics) for data to actually collect — the code is
  necessary but not sufficient on its own.

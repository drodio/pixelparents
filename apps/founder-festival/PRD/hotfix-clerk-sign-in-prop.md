# Branch: `hotfix-clerk-sign-in-prop` — progress log

Branched from `main` (post PR #30). Vercel prod build was failing with a
TypeScript error introduced by PR #27 — the "Log in" button passes
`redirectUrl` to Clerk's `openSignIn`, but Clerk v7 renamed that prop
to `fallbackRedirectUrl`. Hotfix.

## Progress Update as of 2026-05-25 6:40 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
- `src/components/UserBadge.tsx` line 51:
  `clerk.openSignIn({ redirectUrl: "/" })`
  → `clerk.openSignIn({ fallbackRedirectUrl: "/" })`
- `pnpm tsc --noEmit` passes locally now (was failing on this single
  line per Vercel's build log).

### Operator follow-up:
- Future bug-fix branches should consider running `pnpm tsc --noEmit`
  in the pre-commit hook to catch TS-only failures before they hit the
  Vercel build. The vitest suite (88 tests) passed locally on PR #27
  because vitest doesn't typecheck — only `tsc` does. Worth a small
  addition to `.husky/pre-commit`.

### Potential concerns:
- No related concerns. Hotfix is a single one-line change.

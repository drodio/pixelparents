## Progress Update as of 2026-05-28 09:47 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Extends the IS_PROD_DB skip-guard pattern (established by PR #114) to the three remaining test files that were leaking test fixtures into prod whenever the suite ran with `.env.local` pointing at the production Neon branch.

### Detail of changes made:
- `tests/app/events-apply.test.ts`: imports `IS_PROD_DB`, wraps `describe("POST /events/:slug/apply", ...)` with `describe.skipIf(IS_PROD_DB)`. This was the primary leak source — it seeds eval rows with `linkedin.com/in/applicant-*`, `dup-applicant-*`, and `draft-*` URL patterns that the leaderboard filter excludes but that still pollute the DB.
- `tests/app/scoring-tick-events.test.ts`: same pattern. Seeds `auto-*`, `low-*`, `near-*` patterns. Was the source of the "Auto Founder" and unnamed test rows the user kept seeing.
- `tests/app/admin-profile-hide-delete.test.ts`: same pattern (my own test from PR #110). Wrapped both `hide` and `delete` describe blocks.
- Each file now matches PR #114's convention: `import { IS_PROD_DB } from "../setup"` + `describe.skipIf(IS_PROD_DB)(...)`.

### Verification:
- Locally `.env.local` was repointed at the dev Neon branch (`ep-old-shadow-aq914w0y`) earlier in this session, so the skip guard normally wouldn't fire here — but if anyone re-pulls Vercel env into `.env.local`, the guard kicks in.
- Pre-existing test setup at `tests/setup.ts:18-28` already warns at suite start when prod is detected; the skip silently no-ops those suites in that condition.

### Potential concerns to address:
- **A proper Neon test branch is still the right long-term fix.** Skip-when-prod means these tests are effectively dead unless someone provisions `TEST_DATABASE_URL`. Pre-existing concern, not new — and PR #114 already called it out.
- **Three other prod-data-affecting actions today (env rewires) are now in place too** — Vercel Production points at prod Neon; Preview now points at dev Neon (was missing); Development points at dev Neon. That's the upstream fix that makes this leak much rarer going forward.

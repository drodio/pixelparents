## Progress Update as of 2026-05-28 02:59 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry for this branch. Fixes a bug where the lifecycle welcome email greeted users by their full name instead of their first name. Hardened `firstNameFor()` so it applies its existing first-whitespace-token reduction to Clerk's `firstName` as well as to the DB-side fallback name.

### Detail of changes made:
- `src/lib/welcome-emails.ts` — `firstNameFor()` now reduces *both* its `clerkFirstName` and `fallbackName` inputs to the first whitespace-separated token (was: trusted Clerk's value as-is, only split the fallback). Refactored to a single `firstToken()` helper that returns `undefined` for empty/whitespace strings so `??` chaining works correctly. Updated the comment to call out that Clerk's `firstName` is user-controlled and routinely contains a full name.
- `tests/lib/welcome-emails.test.ts` — added a `firstNameFor` case covering `"Jordan Lee"` and a whitespace-padded variant in the Clerk-`firstName` slot. All 9 tests in this file pass.
- Investigation findings worth preserving for future ramp-up:
  - The schema (`src/db/schema.ts`) has **no** `firstName`/`lastName` columns on `users`. The only name field is `evaluations.full_name` (LinkedIn-derived, used for scoring context, not for greetings).
  - Clerk is the source of truth for user names. The app does not customize Clerk's sign-up UI and does not write to Clerk's `firstName`/`lastName` from app code, so whatever is in `clerkUser.firstName` came from either Clerk's default sign-up form or an OAuth provider (LinkedIn / GitHub) — not from anything this codebase controls.
  - The cron sweep at `src/app/api/cron/lifecycle-emails/route.ts` is the **only** welcome-email send path. Both `runClaimWelcomePass()` and `runDevApiWelcomePass()` route their greeting name through `firstNameFor()` — there is no bypass path that sends a raw full name.
- All 279 tests that ran in the suite pass. 26 test files fail at import time because this worktree lacks a `.env.local` and `src/db/index.ts:5` requires `DATABASE_URL` — pre-existing environmental issue, not introduced by this change.

### Potential concerns to address:
- **Dev API welcome path falls back to `"there"`.** `welcome-email-sweep.ts:179` calls `firstNameFor(info.firstName, null)`. If a dev-API registrant has no Clerk `firstName`, the greeting is `"there"` rather than something derived from their email local-part. Consider passing the email local-part as the fallback.
- **`PRD/main.md` does not get journal entries from worktree branches.** This branch (`worktree-infrastructure`) was auto-named by `EnterWorktree`. Future branches with semantic names will get clearer PRD filenames.
- **Lockfile detection warning on Next.js dev start.** Next picks `/Users/drodio/package-lock.json` as the workspace root because there are multiple lockfiles on disk. Cosmetic for now, fixable by setting `turbopack.root` in `next.config`.
- **Schema-drift guard fires only on `src/db/schema.ts` changes.** This commit doesn't touch the schema, so the guard didn't run. Worth remembering if/when we add first/last columns (we deliberately did NOT — Clerk owns identity here).

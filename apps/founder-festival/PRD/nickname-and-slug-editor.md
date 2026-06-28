## Progress Update as of 2026-05-28 05:13 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged `origin/main` into this branch to pick up parallel PRs (#105 phone/breadcrumb, #107 credibility-radar, plus credibility-radar improvements, leaderboard-search, profile-location-display, etc.) and resolve the file conflicts they introduced. Branch is now mergeable into main; PR #103 is ready to ship.

### Detail of changes made:
- `src/app/(authed)/account/page.tsx`: hand-merged main's breadcrumb additions with this branch's claimed-user data load. Header now renders the gold "Profile › Account" breadcrumb (PR #105) PLUS the conditional `<ProfileSettingsSection />` for claimed users (PR #103). Both server-side helpers (`loadMyProfileUrl` + `loadClaimedProfile`) coexist.
- Migration numbering collision resolved: main's `0021_concerned_payback` (recommendation_visibility table from PR #107) takes the 0021 slot; this branch's nickname/slug migration is regenerated as `0022_lush_dragon_man.sql`. Drizzle's `_journal.json` and snapshot files are reconciled.
- The actual schema changes are already live on the shared Neon DB (dev + prod use the same DATABASE_URL), so the regenerated migration file is documentation. Deploy uses `drizzle-kit push` (not migrate), so the file isn't re-run on deploy.
- Type check passes. Full test suite shows two pre-existing parallel-execution flakes (rescore-all + profiles-scored race on shared DB state); both pass individually, unrelated to this merge.

### Potential concerns to address:
- **Two pre-existing flaky tests** under parallel execution. Worth flagging as a follow-up — they're not deterministic. Not introduced by this work.
- **PR title and body** still reflect the original scope (nickname + URL editor). Since this branch now also includes the heading polish, edit pencil, error reporter, and a merge from main, the maintainer may want to skim the latest commits before merging.

## Progress Update as of 2026-05-28 04:57 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Profile heading polish, edit-pencil affordance with claim-or-edit behavior, deep-link from pencil to the URL & Nickname section, AND a centralized server-error reporter (PostHog + admin email with in-memory dedupe) wired into the rescore route as the first user.

### Detail of changes made:
- `src/app/(authed)/profile/page.tsx`: heading reads "Welcome, [Name]" (comma added); when nickname is set, the LinkedIn icon moves into the full-name subtitle row (slightly smaller h-4 to match). When no nickname is set, icon stays next to the welcome line. Outer heading container is now `group` so the new edit pencil reveals on hover.
- `src/components/EditNameButton.tsx`: new client component. Pencil icon (FiEdit2) hidden until parent hover, then fades in (also visible on keyboard focus). Owner → `<a href="/account#profile-url-nickname">`. Non-owner → opens ClaimProfileModal.
- `src/components/ProfileSettingsSection.tsx`: section now has `id="profile-url-nickname"` and `scroll-mt-6` so the pencil's deep-link scrolls cleanly into view with breathing room at the top.
- `src/lib/report-server-error.ts`: NEW helper. Captures every caught server error to (1) console.error, (2) PostHog via `posthog.captureException`, (3) `sendAdminAlert` email. Email is deduped IN-MEMORY by `name:message` fingerprint, max 1/hour per fingerprint, so a stuck endpoint doesn't email-bomb the inbox. Safe no-op when neither PostHog nor RESEND_API_KEY is configured (dev).
- `src/app/api/rescore/route.ts`: catch block now `await reportServerError(err, { route: "POST /api/rescore", evaluationId })`. Replaces the prior bare `console.error`. Demonstrates the pattern; same one-liner can drop into any other route handler that catches and 5xx's.
- Same-branch scope creep noted: this commit also includes operator alerting wiring that's not strictly part of "nickname + editable URL". Kept on-branch for speed; can be split before merge if desired.

### Potential concerns to address:
- **Other route handlers still silently `console.error`-and-return-5xx.** Pattern is now available; needs deliberate spread (claim/callback, cron jobs, eval pipeline, stripe webhook). One-liner per route. Out of scope for this PR, but a clear next step.
- **In-memory dedupe resets on serverless cold starts.** Worst case: one extra email per cold start per error fingerprint. Acceptable. If we want true cross-instance dedupe later, swap the Map for a tiny `error_alerts` table keyed by fingerprint + last_sent_at.
- **PostHog alerts** are a parallel layer that can also be configured in the PostHog UI on `$exception` event. Not in this PR; mentioned for the user to consider as a redundant alerting channel.
- Edit pencil's deep-link is `/account#profile-url-nickname`. PR #105 (which adds the breadcrumb) and this PR both modify `account/page.tsx` and `profile/page.tsx` — expect merge conflicts to resolve. Conflicts will be small but real.

## Progress Update as of 2026-05-28 03:33 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Implementation complete; PR ready to open. Schema/migration, validators, server action, routing logic, account UI section, profile heading change, and welcome-email integration all done. 297 unit tests pass (up from 279). Type check clean; no new lint issues in touched files.

### Detail of changes made:
- Schema (`src/db/schema.ts`): added `users.nickname text`, new `profileSlugAliases` table, replaced the per-role `(slug_kind, slug)` unique index with a global unique on `slug`. Migration `drizzle/0021_milky_mordo.sql` includes a pre-flight collision-resolution UPDATE that auto-suffixes any cross-role duplicates with their UUID prefix BEFORE the new unique index is created (so the migration can't fail on existing data, and is safe to re-run).
- Validators (`src/lib/profile-slug-validate.ts`): pure (no DB) functions `validateSlug`, `validateNickname`, `validateSlugKind`. Reserved-words list blocks `founder`, `investor`, `api`, `profile`, `admin`, `dev`, `developers`, `account`, `claim`, `setup`, `leaderboard`, `pricing`, `about`, `settings`, plus auth/CRUD verbs. Slug regex is `^[a-z0-9]+(?:-[a-z0-9]+)*$`, length ≤ 64. Nickname trims, max 32 chars, rejects control characters. Tests: 15/15 pass.
- DB helpers (`src/lib/profile-slug-edit.ts`): re-exports the validators and adds `isSlugTaken(slug, selfEvalId)` which checks both `evaluations.slug` and `profile_slug_aliases.alias_slug`.
- `ensureUniqueSlug` (`src/lib/profile-slug.ts`): now consults BOTH the active slug column and the aliases table, since uniqueness is global. The `kind` parameter is retained in the signature but no longer scopes the check.
- Server action (`src/app/api/account/profile-settings/route.ts`): POST endpoint, Clerk-auth gated, requires `users.evaluationId` (i.e. claimed user). Validates each field, pre-checks slug uniqueness, writes alias AFTER successful slug update to avoid orphans, catches Postgres `23505` unique-violation as a typed `slug_taken` race error. Returns `{ ok, nickname, slug, slugKind }`.
- Routing (`src/app/(authed)/profile/[handle]/[slug]/page.tsx`): lookup is now global-by-slug. If the URL's role doesn't match the profile's canonical `slugKind`, redirects to the canonical URL. If the slug isn't in `evaluations` but is in `profile_slug_aliases`, redirects to the linked profile's current canonical URL.
- Account page (`src/app/(authed)/account/page.tsx`): server-side load of `(nickname, slug, slugKind, fullName)` for the claimed user; conditionally renders the new section. Unclaimed users see the existing form unchanged.
- `ProfileSettingsSection` (`src/components/ProfileSettingsSection.tsx`): client component with live validation, live URL preview, live "Welcome [Nickname]" + full-name subtitle preview. Submits via `fetch` to the server action; surfaces field-scoped errors.
- Profile heading (`src/app/(authed)/profile/page.tsx`): when the claimed owner has a nickname, heading shows "Welcome [Nickname]" with full name as smaller subtitle. Otherwise current behavior. Owner's nickname is read from the existing `anyClaim` query (one new column added to the select).
- Welcome email (`src/lib/welcome-emails.ts`): `firstNameFor` gains a nickname slot at first position. Nickname is used WHOLE (no first-token reduction); Clerk firstName and the DB fallback still go through `firstToken`. Sweep query joins `users.nickname` (claim sweep) and does a batched lookup for the dev-API sweep (which starts from `api_keys`).

### Verification done:
- `pnpm test`: 297/297 tests pass. Pre-existing 26 import-time failures from missing `DATABASE_URL` are unchanged.
- `pnpm exec tsc --noEmit`: clean.
- `pnpm lint`: no new errors or warnings in any file I touched. Pre-existing issues remain (most notably the homepage logo `<a>`/`<img>` that has been in `account/page.tsx` since before this PR).
- Turbopack compiles `/account`, `/profile/founder/<slug>`, and `/api/account/profile-settings` cleanly. Runtime probes return 500 only because no `.env.local` exists in this isolated worktree (no DATABASE_URL → neon() throws at module load). Same root cause as the 26 test-file import failures. Real verification needs to happen on the Vercel preview deploy (real env), which the PR will trigger automatically.

## Progress Update as of 2026-05-28 03:25 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Branch started. Spec written and committed for a new feature that lets claimed users set a nickname and edit their profile URL (role + slug) while keeping the previous URL working via 301 redirect.

### Detail of changes made:
- Spec lives at `docs/superpowers/specs/2026-05-28-nickname-and-profile-slug-design.md`. Read it first.
- Branch is based on `origin/main` at `0c0652b` (the prior welcome-email fix is already merged in).
- Decisions locked from the brainstorming session:
  - Slugs become globally unique across roles. Both `/founder/<slug>` and `/investor/<slug>` resolve for every profile; the non-canonical role 301-redirects to the canonical.
  - The canonical role is `evaluations.slugKind`. Default is score-based for unclaimed profiles, user-editable for claimed.
  - Old slugs after a slug change 301-redirect to the new canonical via a new `profile_slug_aliases` table. Old slugs stay reserved.
  - Nickname lives on `users` (only claimed users get one). Replaces the profile heading; full name becomes a smaller subtitle. Also wins over Clerk firstName in welcome-email greetings.
- Data model adds: `users.nickname text NULL`, new `profile_slug_aliases (alias_slug pk, evaluation_id fk → evaluations, created_at)`, drop per-role unique index on `(slugKind, slug)` and replace with global unique on `slug`.
- Migration will auto-suffix any pre-existing cross-role slug collisions. PR description will list the affected rows for human review.

### Potential concerns to address:
- **Cross-role slug collision migration is a one-time data rewrite in prod.** Before merging, the maintainer must inspect the collision list. Migration is safe to re-run after that (idempotent).
- **Slug-edit race condition** is defended by DB-level uniqueness (unique index on `evaluations.slug`, PK on `profile_slug_aliases.alias_slug`), not by application-layer locking. The server action catches unique-violation errors and returns a typed `slug_taken` error.
- **Reserved-slug list** must stay aligned with any future route additions. Currently blocks: `founder`, `investor`, `api`, `profile`, `admin`, `dev`, `account`, `claim`, `developers`.
- **Branch `worktree-infrastructure` is leftover state from the prior PR.** It was merged via PR #102 and its remote was deleted; the local branch still exists. Safe to ignore but can be pruned with `git branch -D worktree-infrastructure` once the user wants to clean up.
- **LinkedIn login error in task #10** may block users from claiming profiles, which is a precondition for using this feature. Investigation is queued; not in scope for this PR.

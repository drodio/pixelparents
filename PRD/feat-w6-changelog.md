## Progress Update as of [June 30, 2026 — 2:00 PM Pacific]

### Summary of changes since last update
First entry for `feat/w6-changelog`. Delivered the public changelog as a velocity
signal: a self-contained self-heal data layer in `lib/changelog.ts`, ~12 seeded
PII-free shipped-feature entries, a per-subscriber unsubscribe token (capability
link), and a "Changelog" link in the landing footer. The branch builds on an
existing (already-on-main) changelog page/schema/cron; this work makes it
self-healing, seedable, and footer-discoverable without breaking the existing
machinery.

### Detail of changes made:
- `lib/changelog.ts` (MINE):
  - Added `ensureChangelogTables()` — self-contained, idempotent DDL (CREATE TABLE
    IF NOT EXISTS + ALTERs + indexes) for `changelog_entries` and
    `changelog_subscribers`. Does NOT depend on `lib/db/ensure.ts`. Runs once per
    cold start, swallows errors (reads degrade to empty rather than throwing).
    Also adds the `unsubscribe_token` column the spec calls for.
  - Added `slugify()` (lowercase, hyphenate, trim, cap 60).
  - Added `SEED_ENTRIES` — 12 crisp, user-facing, PII-free entries for this
    week's shipped work (Sign in with Pixel Parents, AI matcher, in-app
    notifications, growth invites, contact-sharing on accept, Events tab + OHS
    calendar import, privacy/terms + report-to-admin, mobile responsive,
    Framer-Motion overhaul, Geist + design system, directory performance,
    blob-auth security fix). Plausible recent dates, newest first.
  - Added `seedChangelog()` (idempotent on slug; marks seed rows notified so the
    cron doesn't email everyone on first run) and `seedIfEmpty()` (seeds only
    when the table is empty; at most once per cold start).
  - `getChangelogEntries()` and `subscribeEmail()` now call `ensureChangelogTables()`
    first; `getChangelogEntries()` also `seedIfEmpty()` so the page is never blank
    on a fresh DB.
- `app/page.tsx` (MINE): added a "Changelog" link in the landing legal footer row,
  next to report / Privacy / Terms.
- `lib/changelog.test.ts` (NEW): pure-logic tests for slugify, labels, and the
  seed set (count >= 12, unique slugs, canonical slug form, valid change types +
  categories, parseable ISO dates, and a PII scrub asserting no emails/phones).
- Supporting (changelog feature, not in the forbidden list):
  - `lib/db/schema/changelog.ts`: added `unsubscribe_token uuid NOT NULL DEFAULT
    gen_random_uuid()` to `changelog_subscribers` so Drizzle knows the column the
    self-heal DDL creates.
  - `app/api/changelog/unsubscribe/route.ts`: now prefers `?token=…` (capability
    link, no email in URL, can't unsubscribe arbitrary people); falls back to
    `?email=…` for older links. Calls `ensureChangelogTables()`.
  - `lib/changelog-email.ts`: `sendChangelogEmail()` takes an optional
    `unsubscribeToken` and builds a token-based unsubscribe URL when present.
  - `app/api/cron/changelog-notify/route.ts`: passes each subscriber's token to
    the email; calls `ensureChangelogTables()` first.

### Validation
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npm test`: 486 passed (incl. new changelog tests).
- `npm run build`: the symlinked `node_modules` panics Turbopack in the worktree
  (known), so verified by copying changed files into the main checkout
  (`/Users/main/stanfordohs/pixelparents`, real node_modules), building there
  (compiled successfully; `/changelog`, `/api/changelog/subscribe`,
  `/api/changelog/unsubscribe`, `/api/cron/changelog-notify` all in the route
  manifest), then restoring the main checkout to clean.

### Potential concerns to address:
- The existing schema uses `change_type` (feature|enhancement|bug_fix) +
  `summary` + `bullets` + `categories`, which is richer than the spec's literal
  `category (feature|fix|improvement)` + `body`. Kept the existing shape to avoid
  breaking the committed cron + LLM generator (`scripts/build-changelog.mjs`); the
  self-heal DDL mirrors that shape. If the lead wants the exact spec column names,
  that's a follow-up migration.
- `seedIfEmpty()` only seeds an empty table; once entries exist it never re-seeds,
  so edits/deletes stick. If the table is wiped, the next page hit reseeds.
- Self-heal DDL and the Drizzle schema both define `unsubscribe_token`; keep them
  in sync if either changes.

# Changelog page — changelog-page

## Progress Update as of 2026-06-09 — ongoing auto-sync + email automation
*(Most recent updates at top)*

### Summary of changes since last update
Wired the "auto on every ship + email subscribers" automation, split cleanly:
- **CI sync** (`.github/workflows/changelog-sync.yml`): on push to main, runs
  build-changelog against PROD (secrets CHANGELOG_PROD_DB_URL + AI_GATEWAY_API_KEY;
  gated on the ENABLE_CHANGELOG_SYNC var = true). Idempotent/skip-existing so a
  push with no meaningful new work is a fast no-op. New entries land UN-notified.
- **App cron** (`/api/cron/changelog-notify`, every 15 min in vercel.json): emails
  subscribers about un-notified entries from the app (where Resend lives) + marks
  them sent. Historical backfill is pre-marked, so it never fires for it.
- This keeps git/LLM in CI (has history) and email in the app (proper place),
  rather than emailing from CI.
- Prod migration applied + prod backfill running (marked notified → no email blast).

## Progress Update as of 2026-06-09 — synced main (resolved migration collision)
*(Most recent updates at top)*

### Summary of changes since last update
Merged current origin/main. Conflicts: schema.ts (both branches appended tables —
kept main's claim_threads/claim_messages AND the changelog tables) and a drizzle
migration-number collision (both made 0043). Took main's 0043_panoramic_rage,
dropped my 0043, and REGENERATED the changelog migration as 0044_acoustic_mac_gargan
(changelog tables only). tsc 0, drizzle in sync.

## Progress Update as of 2026-06-09 (later) — review feedback + SHIPPING to prod
*(Most recent updates at top)*

### Summary of changes since last update
Applied the user's review feedback and shipping to production.
- Added the standard logo + SiteHeaderNav header to /changelog (added "changelog"
  to SiteHeaderNavPage). Page now matches /leaderboard and /profile chrome.
- Fixed timeline dots to sit CENTERED ON the gray line (border-l-2; removed the
  per-li left margin that pushed dots to the right; dot at -left-[8px]).
- Added a "Subscribe to our Changelog →" link on /developers, below the title and
  before the scoring-rubric copy.
- Shipping: prod migration + `--backfill` (marks historical entries notified so the
  import never emails), merge + deploy, then ongoing auto-sync.

## Progress Update as of 2026-06-09 — built on localhost (for review, not yet merged)
*(Most recent updates at top)*

### Summary of changes since last update
New public **/changelog** page: a vertical timeline of everything we ship, with
type + area badges that filter (leaderboard-style pills), expandable entries, a
lightweight Clerk subscribe, and a deep-linking email notification. Built per the
user's spec; running on localhost:3006 for them to review when back.

### What shipped
- **DB**: `changelog_entries` (slug, shipped_at, title, summary, bullets[], change_type,
  categories[], commit_sha unique, notified_at) + `changelog_subscribers`
  (clerk_user_id unique, email, unsubscribed_at). Migration 0043; applied to the DEV
  Neon branch (localhost reads dev).
- **Generation**: `scripts/build-changelog.ts` — reads git history, LLM-curates each
  meaningful commit (Haiku via AI Gateway) into a human, benefit-oriented entry with
  HARD redaction rules (no PII, no specific point values; scoring entries talk about
  data sources/approach generally). Idempotent on commit_sha; skips already-curated
  commits before any LLM call. Backfilled 139 entries into dev.
- **Page** `/changelog` (under the (authed) group so it gets ClerkProvider but stays
  public, like the leaderboard): timeline with a left rule + gold dots, date+timestamp,
  type/area badges. Badges are clickable → filter; active filters show as ×-able pills
  (leaderboard pattern). Entries expand (title → 1-2 sentence why + bullets). Dark theme.
- **Deep-link**: `/changelog?item=<slug>` scrolls to + expands + flashes that entry.
- **Subscribe**: `ChangelogSubscribe` — Clerk sign-up modal (no profile claim);
  `POST/DELETE /api/changelog/subscribe` stores the Clerk email.
- **Email**: `src/lib/changelog-email.ts` builds an on-brand email (deep-link button);
  `notifyNewChangelogEntries()` emails subscribers for un-notified entries (prod-only).
  Preview at `/changelog/email-preview` (renders the real email in an iframe).
- **Hook**: `.husky/post-commit` runs the sync for new commits in the background
  (non-blocking, dev DB, never emails). `CHANGELOG_HOOK=off` to skip.

### Decisions / open questions for review
- Categories: user's list + Pipeline, Security, Performance, Infrastructure, Design,
  Billing. Easy to add/rename in `changelog-constants.ts`.
- "Auto on every commit" vs "everything we ship": the hook adds per-commit (dev);
  PROD sync + subscriber emails should run as a post-deploy/cron step
  (notifyNewChangelogEntries) — NOT from a local hook (never email from a checkout).
- Did NOT add a header-nav link (touches shared chrome/mobile layout) — easy to add.
- Backfill covers the most-recent 140 meaningful commits (the active period). Can
  extend to full history with a higher limit (more LLM calls).

### Potential concerns
- Entries live in the DEV DB for the localhost demo. Prod needs its own backfill
  (`... build-changelog.ts <N> --backfill` against prod, which marks them notified so
  the historical import never emails).

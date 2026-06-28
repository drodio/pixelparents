# Branch: `vanity-profile-urls` — progress log

Branched from `main` (post PR #27). Adds canonical vanity URLs:
`/profile/<clerk_username>` preferred, `/profile/<kind>/<name-slug>`
as the fallback.

## Progress Update as of 2026-05-25 6:20 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Merged main into this branch after the parallel `pill-edit-and-grayscale`
PR #28 landed. Bumped my migration from `0003_marvelous_black_bird.sql`
→ `0004_right_chronomancer.sql` and regenerated the meta snapshot so the
journal stays linear (badges 0003 → slugs 0004). Hand-edited the
generated SQL to use `IF NOT EXISTS` since columns already exist on
both Neon branches from the earlier API apply.

Trivial conflict in `src/lib/leaderboard.ts` — both branches added a
new field to the same `return { ... }` block. Kept both fields side by
side (computeBadges takes overrides AND we set profileHref).

## Progress Update as of 2026-05-25 6:05 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Owner profile pages are now reachable at clean URLs that match what
the visitor would type:
- `/profile/<username>` when the owner has set a Clerk username
  (e.g. `/profile/drodio`)
- `/profile/<kind>/<name-slug>` as the default, where `kind` is the
  dimension with the higher score and `slug` is the kebab-cased name
  (e.g. `/profile/founder/daniel-ruben-odio`).
- Legacy `/profile?e=<uuid>` URL still resolves; new internal links
  use the canonical form.

### Detail of changes made:
- **Schema**:
  - `evaluations.slug` + `evaluations.slug_kind` (unique on the pair).
  - `users.clerk_username` (lowercased index for case-insensitive
    lookups).
  - Migration `drizzle/0003_marvelous_black_bird.sql`, idempotent,
    applied to both Neon branches via API.
- **`src/lib/profile-slug.ts`** (new):
  - `nameToSlugBase()` — NFKD + ASCII fold + lowercase + collapse to
    URL-safe kebab-case.
  - `pickSlugKind()` — ties go to "founder".
  - `ensureUniqueSlug()` — checks (kind, baseSlug) collisions and
    appends `-2`/`-3`/... suffix.
  - `assignSlugIfMissing()` — idempotent assignment used by both
    runEval and reEvaluate. Stable across re-scores per spec.
  - `profileUrlFor()` — picks `/profile/<username>` →
    `/profile/<kind>/<slug>` → `/profile?e=<id>` in that order.
- **`src/lib/eval-pipeline.ts`** — calls `assignSlugIfMissing()` on
  insert AND update; no-ops when the row already has a slug.
- **`src/app/(authed)/claim/callback/route.ts`** — persists
  `user.username` to `users.clerk_username` on every claim (insert +
  onConflictDoUpdate). Backfill happens naturally as users re-claim.
- **Routing**:
  - `/profile/[handle]/page.tsx` — single segment, looks up by Clerk
    username. 404s for `founder` / `investor` (reserved for two-seg
    route).
  - `/profile/[handle]/[slug]/page.tsx` — two segments where handle
    is the kind. Looks up by (slug_kind, slug). 404s on any other
    handle value.
  - Both delegate render to `/profile/page.tsx` (the existing root
    page that takes `?e=<uuid>` via searchParams) by synthesizing
    the eval id into searchParams.
  - Next.js requires ONE dynamic-segment name per level, hence the
    shared `[handle]` instead of separate `[username]` + `[kind]`
    directories that the first draft tried.
- **Internal link generators** updated to use canonical URLs:
  - UserBadge "View My Public Profile" (resolved in (authed) layout)
  - Leaderboard rows (new `profileHref` field on `LeaderboardRow`)
- **One-time backfill** populated slugs for all existing evals on
  both Neon branches (49 dev / 22 prod).

### Operator follow-up:
- This branch's migration is `0003_marvelous_black_bird.sql`; the
  parallel `pill-edit-and-grayscale` branch's migration is
  `0003_hard_hydra.sql`. Both numbered 0003 — drizzle's snapshot will
  see a conflict on the FIRST merge. Whoever merges second needs to
  bump theirs to `0004_*.sql` and re-run `drizzle-kit generate` to
  produce a clean snapshot.
- Generally we still need to update remaining internal references to
  `/profile?e=`. The OG image API, claim callback (return URL),
  re-score button, and a couple of admin pages still use the legacy
  query-string form. They keep working because `/profile?e=` is
  still a valid route — but for consistency the next pass should
  swap them.

### Potential concerns:
- `users.clerk_username` is captured at claim time. If a user later
  changes their username in Clerk, we won't notice until they
  re-claim. A periodic refresh job would catch up.
- `notFound()` in the dynamic routes 404s without surfacing why —
  someone editing a URL by hand wouldn't know if the slug was wrong
  vs the eval was deleted. Minor UX gap; future enhancement.

# Branch: `canonical-redirects` — progress log

Branched from `main` (post PR #28 + #29). Fixes the gap reported by the
user: shared `/welcome?e=<uuid>` and `/profile?e=<uuid>` links were still
landing on the legacy query-string URL instead of the new vanity URL.

## Progress Update as of 2026-05-25 6:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Both legacy URL forms now 307-redirect to the canonical vanity URL
(/profile/<username> or /profile/<kind>/<slug>) when one exists.
Behavior:
- `/welcome?e=<uuid>` (or any extra query params)
  → `/profile/<canonical>?<extras>`
- `/profile?e=<uuid>` (direct hit) → same
- The two dynamic routes that delegate to `/profile/page.tsx` (the
  `[handle]` and `[handle]/[slug]` pages) pass an internal
  `_canonical=1` flag in synthesized searchParams so the page knows
  it's already at the canonical URL and doesn't loop.
- When no canonical exists yet (un-slugged legacy row, missing eval,
  invalid uuid), both routes fall through to the previous behavior.

### Detail of changes made:
- `src/lib/canonical-profile-url.ts` (new) — one helper used by both
  legacy entry points. Looks up the eval's slug + slug_kind, prefers
  the claimer's Clerk username if set, returns the canonical URL or
  null.
- `src/app/(authed)/welcome/page.tsx` — calls canonicalProfileUrl
  first; falls back to /profile?e=<uuid> when null.
- `src/app/(authed)/profile/page.tsx` — same canonical upgrade,
  guarded by the `_canonical` sentinel so dynamic-route delegations
  don't trigger a re-redirect.
- `/profile/[handle]/page.tsx` + `/profile/[handle]/[slug]/page.tsx`
  pass `_canonical: "1"` when synthesizing searchParams.

### Verified on dev:
- `/welcome?e=<id>` → 307 → `/profile/founder/<slug>`
- `/profile?e=<id>` → 307 → `/profile/founder/<slug>`
- `/profile/founder/<slug>` → 200 (no loop)
- All 88 tests pass.

### Operator follow-up:
- Existing prod shared links upgrade naturally on first click — no
  manual backfill needed.

## Progress Update as of 2026-05-28 02:55 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Builds the profile social card request DROdio queued at the start of the
day. Slug-based profile URLs now produce personalized OG / Twitter
metadata; previously only the legacy `?e=<uuid>` URL did, so every
shared `/profile/<username>` or `/profile/<kind>/<slug>` link unfurled
with the generic Founder Festival logo card.

Title format: `Founder Festival: <Full Name>'s Profile` per DROdio's
original spec.

Image: the existing `/api/og?e=<id>` score snapshot.

### Detail of changes made:
- `src/lib/profile-metadata.ts` (new): `buildProfileMetadata(evalId)`
  shared helper. Reads the eval, returns OpenGraph + Twitter metadata
  (or `{}` for low-signal evals — the generic card is fine for those).
- `src/app/(authed)/profile/page.tsx`: `generateMetadata` refactored to
  call the helper for the legacy `?e=<uuid>` URL.
- `src/app/(authed)/profile/[handle]/page.tsx`: NEW `generateMetadata`.
  Resolves `clerk_username` → evalId, then calls the helper.
- `src/app/(authed)/profile/[handle]/[slug]/page.tsx`: NEW
  `generateMetadata`. Resolves `evaluations.slug` → evalId, falls back
  to `profile_slug_aliases` so pre-rename URLs still get the card.

### Verified locally
Curled all three URL shapes against the dev server, each produced
`<title>Founder Festival: Daniel R. Odio's Profile</title>` + the
per-eval `og:image`.

### Potential concerns to address:
- Low-signal evals still return `{}` (generic card). Acceptable for v1
  — those profiles are usually not shared. Easy to relax later if we
  want any signed-in user's profile to get the card.
- `buildProfileMetadata` reads only the columns it needs (no breakdown
  / profile JSON beyond the fullName fallback). One small query per
  unfurl request — fine.

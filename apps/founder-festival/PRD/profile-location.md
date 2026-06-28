## Progress Update as of 2026-05-28 06:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Initial commit on `profile-location`. Adds an editable City / Region /
Country line under the user's name on the profile page. The claimer owns
the data; non-owners just see it. Empty state for owners shows an
"+ Add your location" CTA inline so it's a single click to start typing.

### Detail of changes made:
- Schema: 3 nullable text columns added to `users` — `city`, `region`,
  `country`. Migration `drizzle/0023_glorious_romulus.sql`.
- `src/app/api/account/location/route.ts`: POST endpoint. Auth-gated by
  Clerk session. Updates the signed-in user's row. Validation is light —
  trim + collapse-whitespace + 80-char cap. Empty strings → null (so the
  caller can clear a single field by sending "").
- `src/components/LocationLine.tsx`: client component. Two modes:
  - Display: joins set fields with ", ". For owners: a small pen icon
    swaps to edit mode. For blank state on owner view: an inline
    "+ Add your location" button.
  - Edit: three inline inputs + Save / Cancel. Save POSTs, updates
    local state, drops back to display mode.
  - Hidden entirely for non-owners when all three fields are null.
- `src/app/(authed)/profile/page.tsx`:
  - The existing `anyClaim` query now also pulls city / region / country
    so the data flows through with no extra round-trip.
  - LocationLine renders just under the welcome line / fullName subtitle,
    inside the same centered name block.
- `tests/app/account-location.test.ts`: 7 tests — auth gate, all-three
  update, whitespace collapse, empty-string-as-null, max-length reject,
  newline-in-field collapse-behavior (documented intentional), and
  partial-body behavior (undefined → null, documented).

### Potential concerns to address:
- v1 ships without auto-populating from LinkedIn data. We don't store a
  structured location field today (the eval's `profile.extractedMetrics`
  has things like `ycBatch` and `employeesCount` but no city). Two
  reasonable paths for a follow-up:
  1. Add `location: { city, region, country }` to the AI extraction step
     in `src/lib/scoring.ts` so it's pulled from LinkedIn page text on
     every eval, written to `extractedMetrics`, then auto-seeded into
     `users.city/region/country` on first claim.
  2. Cheap heuristic: regex-parse the first 500 chars of
     `linkedinPageText` for a "City, State" pattern at claim time
     (lower confidence, but no scoring-pipeline change).
- A user with multiple claims (sign out + re-claim creates a new `users`
  row per Clerk userId) sees the most-recent verifiedAt row's location.
  If they change Clerk accounts, their location doesn't carry across.
  Symmetric with how `nickname` and other per-user fields already
  behave; not introduced here.

### Auto-populate decision context:
DROdio asked whether we can auto-populate v1 from LinkedIn data. Short
answer: not without a non-trivial pipeline change. The
`profile.extractedMetrics` JSON column doesn't include location. The NFX
enricher (`src/lib/enrichers/nfx.ts`) has it for some investors but only
as a fact string, not structured. Shipping the editor-only version now
so the feature lands; auto-populate is captured as a follow-up above.

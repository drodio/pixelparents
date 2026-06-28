# feat/ohs-directory

## Progress Update as of June 28, 2026 — 4:15 PM Pacific

### Summary of changes since last update
Addressed roborev review findings (#14391/#14392) on the initial directory commit:
extracted the security-critical gating + field projection into a pure, unit-tested
helper that routes the visibility decision through the canonical `canViewProfile`,
made the children query deterministic, and fixed the density control to reflect
the columns actually rendered.

### Detail of changes made:
- New `lib/directory.ts` (pure, no I/O): `isDirectoryVisible(row)`,
  `directoryPhotoPaths(row, kids)`, `buildDirectoryCard(...)`, and the
  `DirectoryCard` type (now imported by both the page and the client).
  - `isDirectoryVisible` now calls `canViewProfile(coerceShareVisibility(...),
    {isOwner:false, isOhsFamily:true})` for the visibility decision — single
    source of truth with `/p`, so it can't silently diverge if the gate changes.
    Sharing preconditions (`shareEnabled`, `shareToken`, non-blank name) wrap it.
- `app/(authed)/directory/page.tsx` now consumes those helpers (removed the inline
  duplicated gate + field-mapping) and orders the children query by `createdAt`
  so the displayed/first child name and the "sort by child" key are stable.
- `directory-client.tsx`: the "Per row" select is now bound to `effectiveCols`
  (the clamped value actually rendered) with options capped at
  `maxColsForWidth(viewport)`, so it never claims more columns than are drawn.
- New `lib/directory.test.ts` — 16 vitest cases over the gate + per-field
  redaction (private/disabled/no-token/blank excluded; legacy "link" included;
  phone/email/notes never on a card; location/children/interests/photos each
  gated; case-insensitive interest dedup; hero/thumb url mapping). All pass.
- Declined (YAGNI) the "push the filter into SQL / paginate / cache presigns"
  finding: it mirrors the existing `/admin` full-table-load pattern and the
  community is small; noted as a future concern below. tsc + eslint + vitest green.
- Follow-up review (#14396) on the refactor: strengthened the interest-dedup test
  to pin first-seen-wins across the parent/child boundary (17 tests now). Declined
  (acceptable-by-design) the note that re-selecting the clamped "Per row" max can
  lower the stored density across resizes — showing the rendered count and taking
  a selection as the new preference is the intuitive behavior.

## Progress Update as of June 28, 2026 — 4:09 PM Pacific

### Summary of changes since last update
New authenticated `/directory` page (the "OHS Family Directory"): a logged-in,
security-gated grid of family cards built strictly from profiles that have opted
into OHS sharing, reusing the exact visibility model from `/p/[token]`. First
entry on this branch.

### Detail of changes made:
- Added `app/(authed)/directory/page.tsx` (server component) and
  `app/(authed)/directory/directory-client.tsx` (client component).
- **Access control (mirrors `/p/[token]` exactly):**
  - Anonymous viewers are `redirect("/sign-in")` — no data rendered. (The
    `(authed)` group only provides `ClerkProvider`; `proxy.ts` protects
    `/admin` + `/account` only, NOT `/directory`, so the page gates explicitly
    with Clerk `currentUser()`.)
  - "OHS family" is computed the same way `/p` does: a signed-in viewer counts
    only if `getSignupByEmail(primaryEmail(viewer))` returns a row. A logged-in
    non-signup user sees an access-denied panel, never directory data.
  - A signup is included ONLY if
    `shareEnabled === true && Boolean(shareToken) && coerceShareVisibility(shareVisibility) === "ohs"`
    (plus a non-blank name to drop auto-save drafts). This is exactly the set
    for which `canViewProfile("ohs", {isOwner:false, isOhsFamily:true})` is true.
    Private/disabled/legacy profiles are excluded.
  - Per-card field exposure is driven by `shareFieldsOrDefault(row.shareFields)`:
    name always; city/state only on `location`; parent interests only on
    `interests`; children (name/grade/interests) only on `children`; photos only
    on `photos`. Phone/email are NEVER shown on directory cards (detail-only on
    `/p`). No field outside the parent's `shareFields` is ever emitted to the
    client.
- **Cards:** hero = parent's first family photo (graceful gradient + initial
  fallback when none/not shared); parent name; shared children first names;
  deduped (case-insensitive) parent+child interest chips with `iconForInterest`;
  up to 4 photo thumbnails. Whole card links to `/p/<shareToken>` (which
  re-enforces visibility + fields). Children are loaded per-family (like admin).
- **Photos:** all gated behind the `photos` field (matching `/p`), batch-presigned
  via `signedPhotoUrls` (deduped pathnames), capped at 1 hero + 4 thumbs/card.
- **Client controls:** search (parent/child name + interest substring), interest
  filter chips (OR semantics, active state + clear button), sort by parent or
  first-child name asc/desc, and a per-row density select (1–10, default 2) applied
  via inline `gridTemplateColumns: repeat(N, minmax(0,1fr))` and capped by a
  viewport-width hook so cards stay usable on small screens (density 1 renders a
  wide horizontal "row" layout).
- Header uses `PixelMascot` linking home + "OHS Family Directory" heading. The
  existing share-settings link to `/directory` now resolves.
- Verified: `npx tsc --noEmit` clean; `npx eslint` on both new files clean.

### Potential concerns to address:
- No full `next build` run here (needs Clerk/DB env); relied on tsc + eslint per
  task. Pages are `force-dynamic` so no static eval of DB calls at build.
- Loads all signups + all children then filters in app code (same pattern as
  `/admin`). Fine at current scale; revisit with a SQL `WHERE` filter if the
  table grows large.
- Child photo thumbnails can appear under the `photos` field even when `children`
  isn't shared — consistent with `/p` (which shows all photos under `photos`),
  but worth confirming that's the intended privacy contract.

## Progress Update as of June 28, 2026 — 10:14 AM Pacific

### Summary of changes since last update
Removed the public "Anyone with the link" share-visibility tier from the secret
share-link feature. A parent can now only restrict their /p share page to "OHS
Families" (signed-in OHS families) or "Just me" (private). It is no longer
possible to create a share link that anyone with the link can view.

### Detail of changes made:
- `lib/share.ts`: `ShareVisibility` is now `"ohs" | "private"`; dropped the
  `{ value: "link" }` entry from `SHARE_VISIBILITY`; `isShareVisibility` returns
  true only for `"ohs"`/`"private"`; removed the `if (visibility === "link")
  return true` branch from `canViewProfile`. Added exported
  `coerceShareVisibility(raw)` that maps `"ohs"`→`"ohs"`, legacy `"link"`→`"ohs"`
  (downgrade so legacy rows stay OHS-visible but not public), everything else →
  `"private"`.
- Replaced inline `isShareVisibility(...) ? ... : "private"` reads with
  `coerceShareVisibility(...)` in `app/p/[token]/page.tsx`,
  `app/signup/thanks/page.tsx`, and `app/(authed)/account/page.tsx` so legacy
  "link" rows map to "ohs" (not silently to private). Dropped now-unused
  `isShareVisibility` imports in those three files.
- `components/visibility-control.tsx`: signed-out `options` is now `[]` (no
  publicly-viewable tier exists); updated the top comment block.
- `app/signup/thanks/share-settings.tsx`: description copy no longer offers
  "anyone with the link".
- `lib/email.ts`: rewrote the secret-link sentence to drop the public option.
- `lib/db/schema/signups.ts` + `lib/db/signups.ts`: updated comments to
  `'ohs'`/`'private'` (no column type/default change).
- `lib/share.test.ts`: removed the two `["link", ...]` `canViewProfile` cases;
  added `coerceShareVisibility` tests (ohs→ohs, private→private, legacy
  link→ohs, unknown/null/undefined→private).
- Write-side gate in `lib/share-actions.ts` was left unchanged — its
  `isShareVisibility(visibility)` validator now correctly rejects any attempt to
  write `"link"`, which enforces the security goal. Line 151's `coerce`-style
  fallback is only a display value in the non-owner error path and was out of
  scope.

### Verification:
- `./node_modules/.bin/tsc --noEmit` → exit 0 (clean).
- `npx vitest run lib/share.test.ts` → 14 passed.
- `grep -rniE '"link"|anyone with the link' lib app components` → only the
  intentional legacy-mapping line/comment in `lib/share.ts` plus the new test.

### Potential concerns to address:
- Existing DB rows with `share_visibility = 'link'` are downgraded to "ohs" at
  read time via `coerceShareVisibility`. A future data migration could
  permanently rewrite those rows, but is not required for correctness/security.

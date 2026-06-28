# Family photo updates without a page refresh

## Progress Update as of 2026-06-10 11:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Changing a family member's photo on /account now shows the new image immediately
after saving — no manual page refresh needed.

### Detail of changes made:
- `family.ts` `toDTO`: `photoHref` now carries a `?v=<updatedAt ms>` cache-buster.
  The list already refetches after save (`FamilySection.refresh()`), and `setPhotoUrl`
  already bumps `updatedAt` on every photo change — but the photo URL
  (`/api/account/family/<id>/photo`) was byte-identical, so the browser kept serving the
  cached old image. The version query changes when the photo changes, forcing a fresh fetch.

### Potential concerns to address:
- The serve route ignores the `?v` param (lookup is by path id), so it's purely a browser
  cache key — no server change needed.

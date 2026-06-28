## Progress Update as of 2026-05-28 06:35 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Adds a Location section to the `/account` settings page. DROdio asked
where to enter their location and was looking at /account (the natural
home for settings), but the v1 PR only put the editor inline on the
profile page. This fixes that.

### Detail of changes made:
- `src/app/(authed)/account/page.tsx`:
  - `loadClaimedProfile()` now also returns `city / region / country`
    from the user's row.
  - New `<section>` after `<ProfileSettingsSection>` for "Location",
    reusing the same `LocationLine` component already used on the profile
    page (so the editor UX is identical in both places).
  - Only renders when `claimed` is set — unclaimed users go through the
    claim flow first.

### Potential concerns to address:
- Two surfaces now write the same data (inline pencil on /profile/...
  AND the section on /account). Both POST to the same endpoint
  (`/api/account/location`), so no consistency risk. The endpoint
  refetches on next page render.
- We don't have a "verified" / "confirmed" badge on the location yet,
  which the leaderboard could use for location-based filtering. Out of
  scope for this fix.

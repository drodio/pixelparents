# Branch: `claimed-badge-non-editable` — progress log

Branched from `main` (post PR #36).

## Progress Update as of 2026-05-25 7:30 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
"Profile Claimed" badge is no longer interactive on the owner's
profile page. The previous behavior showed ✓/✏/✗ on hover, but
clicking ✗ would mark the badge `rejected` and hide it — implying
the owner could "un-claim" their own profile, which they can't (the
underlying claim row in `users` is what actually drives the
isClaimed signal). Now renders as the read-only `PillReadOnly`
component, even when `editable=true`.

Admin overrides via /admin/pending still work (they bypass the pill
UI entirely).

### Detail of changes made:
- `src/components/Badges.tsx` `Badges()` map:
  - Dispatcher now checks `b.id !== "claimed"` before choosing the
    `EditablePill`. When the badge is "claimed", always renders the
    read-only pill instead.

### Side task done in the same session (not in this commit):
- Deleted Daniel R. Odio's single claim row on the dev Neon branch
  (eval `ffbc7bf1-4376-4321-97c1-74ea87e0753e`, clerk_user_id
  `user_3E5tmyP6TiI5MQlxOH2hGD25lAr`) so the user can re-test the
  claim flow from scratch. Eval row preserved.

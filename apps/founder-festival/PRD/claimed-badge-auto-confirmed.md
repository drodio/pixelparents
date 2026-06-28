# Branch: `claimed-badge-auto-confirmed` — progress log

Branched from `main` (post PR #33).

## Progress Update as of 2026-05-25 7:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
"Profile Claimed" badge now auto-renders in full identity-gold from
the moment the eval is claimed — no extra confirm click required.
Asking the user to click ✓ on a "Profile Claimed" pill right after
they just finished claiming the profile was redundant.

### Detail of changes made:
- `src/lib/badges.ts` `computeBadges()` — the `claimed` pill is pushed
  with `status: "confirmed"` instead of the default `"likely"` used by
  every other pill. Override layering still wins (admin can reject it
  via /admin/pending), but the default is now confirmed.

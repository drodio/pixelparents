# Branch: `admin-profile-box` — progress log

Branched from `main` on 2026-05-26.

Adds a floating super-admin toolbar to the profile page: "Admin: [Score Detail]
[Re-Score]", with a minimize-to-invisible-hotspot behavior. Available to super
admins on localhost AND production (email-based gate).

## Progress Update as of 2026-05-26 4:00 PM Pacific
*(Most recent updates at top)*

### Summary
Floating super-admin profile box, per DROdio's spec. Score Detail was already
shown for `isLocalhost || superAdmin`; this wraps it + a direct Re-Score into one
fixed top-right box that can be minimized to an invisible corner hotspot.

### Detail of changes made:
- `src/lib/admin-box-state.ts` (+ test): pure, DI'd localStorage helpers
  (`readMinimized` / `writeMinimized`, key `ff:adminBox:minimized`). "1" =
  minimized; SSR/blocked-storage safe (defaults to expanded). TDD'd in node.
- `src/components/AdminProfileBox.tsx`: presentation-only shell. Fixed top-right;
  shows "Admin:" + children + ✕. The ✕ persists a single GLOBAL minimized
  preference (across reloads + all profiles); minimized collapses to an invisible
  52×52 top-right hotspot (no border/bg/text/cursor cue) that restores on click.
  Uses `useSyncExternalStore` (SSR-safe read, no setState-in-effect; same-tab
  notify via a listener set + cross-tab via the `storage` event).
- `src/components/ReScoreButton.tsx`: new `adminDirect` prop — when set, clicking
  re-scores immediately, skipping the claim/verify modal a non-owner hits.
- `src/app/api/rescore/route.ts`: authorize `owner || isAdmin || isSuperAdmin`
  (was `owner || isAdmin`) so the box's direct re-score can't 403 a super-admin.
- `src/app/(authed)/profile/page.tsx`: render `<AdminProfileBox>` (gated on the
  existing `showScoreDetail = isLocalhost || superAdmin`) wrapping ScoreDetailButton
  + `<ReScoreButton adminDirect variant="link">`. Removed the standalone header
  Score Detail button.

### Verification:
- tsc clean; eslint clean on changed files (the one `<img>` warning in
  ReScoreButton is pre-existing). `admin-box-state` unit tests 3/3. Dev server
  compiles + serves /profile (200). Visual/interaction (box render, minimize/
  restore, direct re-score) to be confirmed in a logged-in super-admin browser.

### Potential concerns to address:
- Styling of ScoreDetailButton / ReScoreButton inside the dark box may want a
  small polish pass once seen live (they keep their own button/link styles).
- Re-score is a real paid run (~$0.12) that overwrites the eval in place; it's
  one click for a super-admin (chosen: no confirm dialog).

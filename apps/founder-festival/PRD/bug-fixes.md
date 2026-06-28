# Branch: `bug-fixes` — progress log

Branched from `main` (post PR #23 polish-followups). Catch-all branch for
QA fixes and small follow-ups.

## Progress Update as of 2026-05-25 5:45 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Big grab-bag of UX polish + a couple of structural changes:

- **Home page**: signed-in users still auto-redirect to their profile,
  but in-app navigation to `/?home=1` (passed by every "go home" link)
  now bypasses the redirect so clicking the FF logo actually reaches
  the splash. The LinkedIn input is auto-focused; first keystroke now
  reveals the cover image (was failing because the autofocus event
  fired before React hydration). The tagline only shows line 1 by
  default + reserves all 3 lines of space so the form doesn't shift
  when the user interacts. The tagline itself is now a click target.
- **Splash tagline**: "Intimate pop-up IRL events" (no commas).
- **Find-handle helper**: no-match copy now offers a mailto link to
  `Founder@Festival.so` (capital F) with prefilled subject/body. The
  link doubles as a copy-to-clipboard button with a "✓ Copied" flash
  for users whose browser/system has no mail handler configured.
- **Leaderboard**: notice "Unclaimed profiles may have incorrect
  information." is centered under the title with tighter spacing.
  "Claimed" pill sits inline next to the name (was wrapping below).
- **Welcome page → /profile**: every route renamed from `/welcome` to
  `/profile`. `/welcome?…` keeps a 307 redirect for old shared links.
- **Score-table polish**:
  - Confidence circles show "NN%" always (not just digits) with a
    `Probability of being accurate (NN%)` tooltip that pops on hover
    (custom Tailwind bubble — native title had a 1-2s browser delay).
  - Graduated color shades within each band: every 5% in the band
    steps to a darker shade (e.g. 75% blue is lighter than 95% blue).
    Implemented via inline `style.backgroundColor` with a hex-lerp
    helper since Tailwind can't generate dynamic classes.
  - ✓ / ✏ / ✗ icons now show on hover for EVERY visitor (even logged
    out). Click branches:
      - anonymous / signed-in-unclaimed → opens Claim Profile modal
      - owner-needs-setup → routes to /account/setup
      - owner / admin → POSTs to /api/score-items
    Admin viewers see a small purple "Admin" pill next to the icons.
  - New "+ another item" circle at the bottom of each rubric. Adds a
    user-supplied row with `source='user'`, `status='pending'`,
    `confidence=100`, sort_order at the end. Inline form with text +
    points fields. New POST /api/score-items collection endpoint with
    the same owner-or-admin gate.
  - Backwards: `/api/score-items/[id]` action gating split — only
    admins can resolve `status='pending'` rows; owners can still
    confirm/reject `status='likely'` rows on their own profile.
- **UserBadge / login**:
  - Top-right shows a "Log in" button when signed out. Clicks open
    Clerk's sign-in modal with `redirectUrl: "/"`, so successful
    sign-in lands them on their /profile via the home-page redirect.
  - "View My Public Profile" menu item added to Clerk's UserButton
    dropdown when the signed-in user has a claimed evaluation. Link
    is built server-side in the (authed) layout (looks up
    `users.evaluationId` for the Clerk userId).
- **EventsCTA**: rounded-full → rounded-md.
- **Modal personalization**: ClaimProfileModal accepts a `firstName`
  prop; "{firstName}, claim your profile" when known.
- **API**: new `POST /api/score-items` (collection) for user-added
  items. `/api/score-items/[id]` admin gating tightened.
- **Devops**:
  - Dev server moved to PORT=3004 (configurable) so it doesn't
    collide with other agents' dev servers on 3000/3001.
  - Synced re-scored prod data into the dev Neon branch (one-shot
    script — 14 eval rows + 101 score_items rows updated) so
    localhost confidence circles match prod.
  - Deleted Daniel Odio's claim rows on dev so he can re-test the
    LinkedIn claim flow from scratch.
  - Freed ~3.3 GB by removing the local Turbopack cache (.next, .turbo)
    after disk hit 100% during a long session.

### Operator follow-up:
- Vanity profile URLs (`/profile/<username>` and
  `/profile/<kind>/<name-slug>`) are NOT in this commit — that work
  starts on the next branch.

### Potential concerns to address:
- The schema-drift pre-commit hook now runs `pnpm drizzle-kit
  generate` whenever `src/db/schema.ts` is staged. This commit doesn't
  touch the schema; vanity-URL work in the next branch will.

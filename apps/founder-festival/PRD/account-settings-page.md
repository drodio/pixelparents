# Branch: `account-settings-page` — progress log

Branched from `main` (post PR #45 + PR #46).

## Progress Update as of 2026-05-26 11:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
New `/account` settings page that revisits the same controls
already on `/account/setup`, but reframed for users who've already
finalized their membership and just want to tweak their notification
choices later.

Behavior:
- Title: "Account" with a one-line subtitle ("Manage your contact
  methods and notification preferences.").
- Same Email + Phone verification cards (so they can swap or add).
- Same 5×2 PreferencesTable.
- No "Finalize Membership" bottom CTA — toggles save on click, with
  a small "Changes save automatically." caption.
- Linked from the Clerk UserButton dropdown as "Account settings"
  (between "View My Public Profile" and the red "Delete my profile").

### Files touched
- `src/components/AccountSetupForm.tsx`:
  - New `mode?: "setup" | "settings"` prop. `nextUrl` is now optional.
  - Setup mode: unchanged — renders the bottom "Finalize Membership"
    button that pushes nextUrl when both methods are verified.
  - Settings mode: omits the button, prints a small "Changes save
    automatically." line at the bottom.
- `src/app/(authed)/account/page.tsx` (new) — the settings page.
  Server-side `currentUser()` gate; redirects unauth visits to `/`.
- `src/components/UserBadge.tsx`:
  - New "Account settings" link in the menu items.
  - New `SettingsIcon` (gear, same 16×16 / stroke-1.5 / currentColor
    style as the other icons).

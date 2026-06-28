# Branch: `delete-profile-red-link` — progress log

Branched from `main` (post PR #44).

## Progress Update as of 2026-05-26 11:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
"Delete my profile" item in Clerk's UserButton dropdown now renders
in destructive red (`#ef4444`) so it visually reads as a dangerous
action. Hover lightens to red-300.

### Why CSS, not appearance prop:
Clerk v7's `<UserButton.Action label="…" />` takes only a string —
no JSX, no inline styles per item. The cleanest path is a CSS rule
against the class Clerk emits for custom actions
(`cl-userButtonPopoverCustomItemButton__<slug>`). I cover both the
camelCase + kebab-case slug variants Clerk might emit, plus a
`:last-of-type` fallback (Delete is always the last action in our
menu) so a future Clerk version that changes the slug convention
doesn't silently un-red the button.

### Files touched:
- `src/app/globals.css` — appended a small block of selectors that
  set `color: #ef4444 !important` on the Delete action and its
  hover state.

### Potential concerns:
- The `!important` is load-bearing because Clerk's own stylesheet
  ships with a default color rule that beats our specificity
  otherwise. Acceptable trade-off; this is the only rule with
  `!important` in the file.

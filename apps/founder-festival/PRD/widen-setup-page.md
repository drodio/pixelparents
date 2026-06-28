# Branch: `widen-setup-page` — progress log

Branched from `main` (post PR #43).

## Progress Update as of 2026-05-26 11:15 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Two fixes from QA:
1. **Container widened** `max-w-2xl` (672px) → `max-w-3xl` (768px) so
   the Text card's `[country picker] [phone input]` row has room and
   the "415 555 0100" placeholder no longer kisses the card border.
2. **Disabled toggle tooltip** replaced the native `title=` attribute
   (which has a 1-2s browser delay and often doesn't fire on
   disabled buttons) with a custom hover bubble. Bubble floats above
   the toggle on a `group/toggle` span wrapper, shows immediately
   on hover, only renders when the toggle is disabled. Copy:
   "Verify your email + text first".

### Detail of changes made:
- `src/app/(authed)/account/setup/page.tsx` — width bump.
- `src/components/AccountSetupForm.tsx` `Toggle`:
  - Wrapped the disabled-able button in a `<span class="group/toggle">`.
  - Added a `<span role="tooltip">` sibling that uses
    `hidden group-hover/toggle:flex` so the bubble appears
    immediately when the cursor enters the wrapper.
  - Pointer-events on the bubble itself are `none` so it doesn't
    intercept the button's own hover state.

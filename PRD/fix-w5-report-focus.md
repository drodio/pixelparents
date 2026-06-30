## Progress Update as of [June 30, 2026 — 1:34 PM Pacific]

### Summary of changes since last update
First entry for this branch. Fixed the landing-page footer "Report a bug or abuse"
trigger rendering a visible focus box on initial page load. Root cause: the
focus-restore effect in `app/report/report-dialog.tsx` ran on first mount (when
`open` starts `false`) and programmatically focused the trigger button, leaving a
ring until the user clicked elsewhere.

### Detail of changes made:
- `app/report/report-dialog.tsx`:
  - Added a `wasOpenRef` ref to track the previous `open` value. The focus-restore
    effect now only calls `triggerRef.current.focus()` on a genuine open→close
    transition (`!open && wasOpenRef.current`), never on initial mount. This is the
    core fix — the trigger is no longer focused on page load.
  - Hardened the trigger button's classes to drive its ring purely off
    `:focus-visible` (`focus:outline-none focus-visible:outline-none
    focus-visible:ring-2 ...`), so even a programmatic focus restore on dialog
    close never shows a box, while keyboard Tab still shows the amber ring. Added
    `rounded-sm` so the ring corners match.
- No `autoFocus` existed on the trigger; the bug was purely the mount-time focus call.
- Privacy/Terms `<Link>`s in `app/page.tsx` already rely solely on the global
  `:focus-visible` rule (globals.css) with no programmatic focus, so they do NOT
  exhibit the bug and were left unchanged.

### Potential concerns to address:
- The dialog focus-trap is minimal (focuses the dialog container on open, restores
  to trigger on close); it does not trap Tab inside the modal. Out of scope for this
  fix but worth a future a11y pass.
- Keyboard close via Escape will restore focus to the trigger programmatically; since
  the ring is `:focus-visible`-driven and Escape is a keyboard interaction, browsers
  may or may not show the ring depending on heuristics — acceptable, since a keyboard
  user seeing a ring after Escape is correct/expected behavior.

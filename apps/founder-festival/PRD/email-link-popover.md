# email-link-popover

## Progress Update as of 2026-06-22 09:01 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Replaced the browser `window.prompt` link box (Cmd-K / 🔗) with a custom inline link
popover anchored near the selection. Its URL field is itself a variable-pill editor, so you
can type a plain URL **or** `@`-mention a variable to drop a pill into the link URL — e.g. a
link whose href is `{{profile-url}}` resolves to each recipient's own profile.

### Detail of changes made:
- `VariablePillInput.tsx`:
  - New `LinkPopover` (portaled, positioned via `editor.view.coordsAtPos` near the selection
    start) with a nested non-rich `VariablePillInput` as the URL field (so the same `@`
    variable suggestion + `{{key}}` serialization is reused), plus Apply / Remove link /
    Cancel and Esc-to-close.
  - New `autoFocus` prop on `VariablePillInput` (focuses the URL field on open).
  - Cmd/Ctrl-K now opens the popover via `editorProps.handleKeyDown` calling a ref-held
    opener (`openLinkRef`) — removed the old `window.prompt` `promptLink` + the `LinkShortcut`
    TipTap extension. The 🔗 toolbar button calls the same `openLink`.
  - `openLink` captures the selection range + current link href; `applyLink`/`removeLink`
    restore that range (`setTextSelection`) then `setLink`/`unsetLink`, so focus moving to the
    popover's URL field doesn't lose the target text.
  - Bumped the `@`-suggestion dropdown z-index 60 → 80 so it renders above the popover overlay
    (70) and panel (71).

### Potential concerns to address:
- The link href can be a variable marker (`{{…}}`); the editor's `isAllowedUri` permits
  markers and the send-time sanitizer remains the real guard against `javascript:` etc.
- If text isn't selected and the cursor isn't on a link, Apply is a no-op (nothing to wrap) —
  acceptable; the normal flow is select text → 🔗/Cmd-K → set URL.

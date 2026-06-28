# photo-caption-autosave

## Progress Update as of 2026-06-09 9:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Admin per-photo captions now auto-save ~0.6s after you stop typing (debounced),
with a "Saving…/Saved" indicator — replacing the onBlur-only save that silently
dropped captions if focus never left the box. This is why captions weren't
appearing on the public recap.

### Detail of changes made:
- `src/components/admin/EventPhotoManager.tsx`: added a `CaptionInput` sub-component
  (controlled value + 600ms debounce → existing `patch(id, {caption})` + status
  indicator); replaced the per-photo `<input defaultValue onBlur>` with it.

### Context / scope:
- Caption RENDERING and photo "Added by <name>" attribution were already shipped
  on main (PRs #280 etc.) — this PR only fixes the admin caption SAVE trigger.
- No schema/API change.

### Potential concerns to address:
- Status flips to "Saved" even if the PATCH fails (fire-and-forget, matches the
  existing patch pattern); a future pass could surface save errors.

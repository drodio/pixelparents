# PRD — admin-autosave

## Progress Update as of 2026-06-08 11:00 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Removed the explicit Save buttons from the admin event + sponsor/host editors — everything now
auto-saves (checkboxes/toggles save immediately; text/rich-text debounce ~700ms). A small
"Saving… / Saved ✓ / Couldn't save" status replaces each button. No schema/migration.

### Detail of changes made:
- `src/components/admin/useAutosave.tsx` (new): shared hook (`schedule` debounced, `saveNow`
  immediate, generation token so last edit wins) + `<AutosaveStatus>` indicator.
- Toggles (save immediately): `EventHostPicker`, `EventSponsorPicker`.
- Debounced text/date/rich-text: `EventDateEditor`, `SponsorEditor`, `HostEditor`,
  `EventLearningsEditor`.
- `EventPrioritiesEditor`: inline-edit now commits on blur/Enter (Save button removed; Cancel
  kept via mousedown-preventDefault). Add/remove already auto-saved.
- `EventPhotoManager` was already auto-saving (upload/caption/visibility/delete) — untouched.

### Potential concerns to address:
- `ProfileSettingsSection` (the user /account settings) also has a Save button but is out of
  scope (not an admin event/sponsor page) — left as-is.
- Debounce is 700ms; if it feels too eager/laggy, tune the `useAutosave` delay.

# priorities-autosave

## Progress Update as of 2026-06-08 11:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Event priorities (on the admin recap page) now save automatically on every add,
edit, or remove — the separate "Save priorities" button is gone. Each priority
row also gained an inline **Edit** action alongside Remove.

### Detail of changes made:
- `src/components/admin/EventPrioritiesEditor.tsx`: replaced the manual `save()`
  button flow with a `persist(next)` helper that optimistically updates local
  state then POSTs the full list to `/api/admin/events/[id]/priorities` (the API
  is replace-all, so posting the whole array after each change is correct).
- Added inline edit: clicking **Edit** on a row swaps it into a category `<select>`
  + text `<input>` with Save/Cancel; Enter commits, Escape cancels. Commit and
  remove both auto-persist.
- Added a small status indicator ("Saving…" / "Saved" / "Couldn’t save — try
  again") in the header row, replacing the old per-save message next to the button.

### Potential concerns to address:
- No debounce: rapid successive changes fire one POST each. Fine at this scale
  (handful of priorities, single admin), but if priorities ever grow large or
  multi-user, consider debouncing or a last-write-wins guard.
- Optimistic update means a failed POST leaves local state ahead of the server;
  the "Couldn’t save" status surfaces this but there's no automatic rollback.

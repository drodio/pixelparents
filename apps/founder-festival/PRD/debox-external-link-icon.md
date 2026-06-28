# debox-external-link-icon

## Progress Update as of 2026-06-12 11:30 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Removed the bordered box-button wrapper around the standalone "open in new tab"
arrow icon on the admin event page — now just the arrow glyph (its own little
box), no big box button around it.

### Detail of changes made:
- `src/app/(authed)/admin/events/[id]/page.tsx`: "View public page" icon link
  dropped `rounded-md border border-zinc-700 px-2 py-1.5 ... hover:bg-zinc-800`;
  now `text-zinc-400 hover:text-zinc-100`, icon bumped to size 16.
- `src/components/admin/ReimportLumaButton.tsx`: same de-box for the "View on
  Luma" icon link.

### Potential concerns to address:
- Smaller tap target without the padding box; acceptable for an admin control.

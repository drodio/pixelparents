# org-badge-rounding

## Progress Update as of 2026-06-12 9:00 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made the host/sponsor custom "Badges" pill (`OrgBadgeEditor`) less rounded —
`rounded-full` → `rounded-md` — to match the profile `Badges` component's rounding.

### Detail of changes made:
- `src/components/admin/OrgBadgeEditor.tsx`: the badge `<li>` pill now uses
  `rounded-md` (was `rounded-full`), matching `src/components/Badges.tsx` (which
  uses `rounded-md`).

### Potential concerns to address:
- DROdio's standing preference: less-rounded UI (rounded-md, not rounded-full
  pills) — applied here; future badge/pill UI should default to rounded-md.

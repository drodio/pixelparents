# attendee-dots-smaller

## Progress Update as of 2026-06-22 08:56 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Made the two per-attendee insight status dots 50% smaller (10px → 5px) on the admin event
attendee rows.

### Detail of changes made:
- `src/components/admin/AttendeeManager.tsx` `ContentDot`: `h-2.5 w-2.5` (10px) → `h-[5px]
  w-[5px]` (5px). Colors/logic unchanged.

### Potential concerns to address:
- None — purely a size tweak.

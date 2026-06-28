# Branch: `admin-events-copy-tweak` — progress log

Branched from `main` (post events-v1 / PR #77).

## Progress Update as of 2026-05-26 9:10 PM Pacific
*(Most recent updates at top)*

### Summary
Copy tweak on the admin dashboard's "Manage Events" card.

"Add, modify or delete Luma events and manage event registration."
→ "Add, modify or delete events and manage event registration.
(Including Luma)"

Events aren't Luma-only, so Luma is moved to a parenthetical
"including" note. Also fixed the user's typo "Incluidng" → "Including".

### Files
- `src/app/(authed)/admin/page.tsx` (card `body` string only).

### Note
- Left the untracked `public/Founder Festival CSV Template - Sheet1.csv`
  alone — not part of this change and not authored here.

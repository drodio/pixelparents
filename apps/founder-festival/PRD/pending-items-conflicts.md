## Progress Update as of 2026-06-09 Pacific

### Summary
Increment 1 of the Pending-Items work (A-D plan). A unified pending-items count +
a bold-red nav badge "Pending Items (N)", and the first new category: PROFILE
CONFLICTS — one verified email mapping to ≥2 evaluations (duplicates OR two
different same-named people sharing an email, e.g. Patricia Liu, Francis deSouza).

### Detail
- `src/lib/pending-items.ts` — getPendingItemsCount() (badge) + getProfileConflicts().
- `admin/layout.tsx` → computes count (manage_pending only) → AdminNav.
- `AdminNav.tsx` — "Pending Items (N)" with N bold + text-red-500.
- `admin/pending/page.tsx` — new Profile-conflicts section + ProfileConflictCard.
- Live (prod): 22 pending (19 conflicts + 3 owner-edits). Surfaces the Patricia +
  Francis-deSouza mis-attributions.

### Next increments
B: merge / re-link / detach-email actions on a conflict.
A: re-link an event attendee to the correct profile.
C: corroboration gate on name-based resolution (prevention) + flag low-confidence.
D: name-hint already shipped — surface as a per-profile action.

# Branch: `admin-rescore-topn-cleanup` — progress log

## Progress Update as of 2026-06-03 3:45 PM Pacific — inline the Top N input

### Summary of changes since last update
Tightened the "Top N by score" branch in /admin/profiles/new → Re-Score
Existing: dropped the separate "Top N profiles" label, the placeholder,
and the wordy caption. The criterion is now just an inline sentence —
"Top [_____] by score" — with the number input where the blank is.

### Detail of changes made:
- `src/components/admin/StaleRescoreForm.tsx` — replaced the labeled
  number field + caption with an inline row reading `Top <input> by score`.
  Input width tightened to `w-24`. All validation (min/max/clamp) and the
  preview wiring carry over unchanged.

### Verification:
- tsc + eslint clean on the touched file.
- No test changes — the API contract / lib function are unaffected.

### Potential concerns to address:
- None new.

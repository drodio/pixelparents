# Branch: `account-remove-phone` — progress log

## Progress Update as of 2026-06-02
*(Most recent updates at top)*

### Summary
Next to "Verify this number" on /account, users can now **Remove** the on-file
(operator/CSV) phone. Clears evaluations.phone for their claimed profile(s);
does NOT touch any Clerk-verified number.

### Detail
- `POST /api/account/clear-phone`: auth'd; sets evaluations.phone=null for all
  evals the current Clerk user claims.
- `PhoneCard`: "Remove" link beside "Verify this number" → POST → router.refresh()
  (prompt disappears). tsc+eslint clean.

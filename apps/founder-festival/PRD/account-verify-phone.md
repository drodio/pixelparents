# Branch: `account-verify-phone` — progress log

## Progress Update as of 2026-06-02
*(Most recent updates at top)*

### Summary
On /account, if we have an operator/CSV-provided phone on file (evaluations.phone)
that isn't already a number on the user's Clerk account, the Text card now shows it
as "On file — not yet verified" with a one-tap "Verify this number" button that runs
the existing Clerk createPhoneNumber → SMS → attemptVerification flow, prefilled
with that number.

### Detail
- `account/page.tsx`: `loadSuggestedPhone(clerkUserId)` reads the claimed eval's
  phone; passed to `<AccountSetupForm suggestedPhone={...}>`.
- `AccountSetupForm`: new `suggestedPhone` prop → `PhoneCard`. Hidden client-side
  when the number already matches one on the Clerk account (digits compare).
  `verifySuggested()` reuses `addAndPreparePhone` then drops into the code step.
- No migration (uses the existing evaluations.phone column from 0031). tsc clean.

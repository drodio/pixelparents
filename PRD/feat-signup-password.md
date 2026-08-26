# feat/signup-password

Round 6 (Aug 26 doc), PR 2 of 2: "when they are signing up, add a place for
them to also set up their password." Chosen design: the password is collected
at the START of signup (with name/email/phone), and the Clerk account is
created the moment the profile row completes — so nobody can finish (or
abandon) onboarding without a way to sign back in.

## Progress Update as of [August 25, 2026 — late evening Pacific]

### Summary of changes since last update

First entry. Password field in the signup basics, a /signup-scoped
ClerkProvider, client-side account creation via `useSignUp()` with an inline
email-code panel when the instance requires verification, and a strict
"never block a completed signup" error policy.

### Detail of changes made:

- **`app/signup/layout.tsx` (new)** — ClerkProvider scoped to /signup. The
  app-wide provider is deliberately scoped to `(authed)` so the public splash
  never boots Clerk JS; /signup sits outside it, so `useSignUp()` needed a
  provider of its own. Multi-domain config (satellite host detection, pinned
  signInUrl/signUpUrl) mirrors `app/(authed)/layout.tsx` exactly — the
  fallback Account Portal is not provisioned, so the URLs must stay pinned.
- **`signup-form.tsx` — password field** in "Your info" (autoComplete
  `new-password`, ≥8 chars enforced on click with the same fail-visible
  pattern as the terms checkbox, never a disabled button). Hidden for a
  signed-in member (`useAuth()`), who already has an account. The password
  lives ONLY in local component state and goes ONLY to Clerk — never into
  `v`, the localStorage draft, or the signups row.
- **Account creation** (`createClerkAccount`): after `completeSignup`
  succeeds, `signUp.password({ emailAddress, password })` — the repo's
  @clerk/nextjs v7 exposes the new signals/"future" API from `useSignUp()`
  (result objects with `{ error }`, no throwing, `finalize()` instead of
  `setActive`; the classic `create`/`prepareEmailAddressVerification` shape
  from the older docs does not typecheck here).
  Status `complete` → `finalize()` → /signup/thanks (signed in).
  `missing_requirements` → `verifications.sendEmailCode()` and the form
  swaps to an inline 6-digit-code panel (`verifyEmailCode` + resend +
  "skip for now" — the skip is first-class because the profile row is
  already saved; the panel is never a trap).
  `form_password_*` errors (weak/breached/short) are the ONE blocking
  case — they're fixable in place, so they render on the field.
  Every other Clerk failure (password strategy disabled, email already has
  an account, network) logs the error code and continues to onboarding —
  account creation must never cost a completed signup.
- **`<div id="clerk-captcha" />`** ahead of the submit row so Clerk's smart
  bot-protection widget has its mount point during `signUp.create()`.

### Flags for review

- **Ansh action required**: enable the **Password** sign-in strategy (and
  email verification code) for this instance in the Clerk dashboard. Until
  then `signUp.create` fails with a strategy error, which this code treats as
  the non-blocking case: members sign up exactly as today, just without an
  account minted — so the PR is safe to merge ahead of the dashboard change.
- Both SignupForm render sites (`/signup`, `/signup/join/[token]`) sit under
  the new layout, so the co-parent join flow gets the password field too.
- If a member refreshes on the inline code panel, the (already-completed)
  local draft was cleared, so the form restarts empty — the skip link and the
  code email both still lead them onward; accepted as an edge.

### Verification (exit codes, per-stage, not tail-piped)

- `tsc --noEmit` = 0, `next lint` = 0, `vitest run` = 0 with **1062/1062
  tests passing** (86 files), production build = 0.
- Honest note: the FIRST typecheck failed (7 errors) — the classic
  `useSignUp` shape (`isLoaded`/`setActive`/`signUp.create`/
  `prepareEmailAddressVerification`) from Clerk's older docs doesn't exist
  in this repo's @clerk/nextjs v7, which returns the new signals/"future"
  resource. Rewrote against the real types (`signUp.password`,
  `verifications.sendEmailCode`/`verifyEmailCode`, `finalize`) and re-ran
  everything green.

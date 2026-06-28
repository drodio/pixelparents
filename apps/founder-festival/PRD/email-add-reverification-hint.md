# Branch: `email-add-reverification-hint` — progress log

Branched from `main` (post PR #56).

## Progress Update as of 2026-05-26 1:35 PM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
PhoneCard already shows the heads-up
"For security, you may first need to re-auth via email to confirm
your identity." when Clerk is likely to demand reverification (session
first-factor age ≥ ~9 minutes — `REVERIFICATION_HINT_MINUTES`).
EmailCard had the same Clerk reverification semantics (createEmail
goes through `useReverification` too) but no UI hint.

Added the same hint inside the EmailCard input/addAnother form,
gated on the same `useReverificationLikely()` hook the phone card
uses. Wording tweaked slightly to point at "your original email"
(makes more sense than "via email" when the user is in the email
flow).

### Files touched:
- `src/components/AccountSetupForm.tsx`:
  - `EmailCard` now also reads `useReverificationLikely()`.
  - Renders `<p>For security, you may first need to re-auth via your
    original email to confirm your identity.</p>` inside the
    input/addAnother form when the hook returns true.

### Potential concerns:
- None.

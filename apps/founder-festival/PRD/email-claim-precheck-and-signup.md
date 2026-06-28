# Branch: `email-claim-precheck-and-signup` — progress log

Branched from `main` (post PR #68).

## Progress Update as of 2026-05-26 8:10 PM Pacific
*(Most recent updates at top)*

### The bug
Claiming via email showed "Couldn't find your account." Root cause:
the modal only called `signIn.create({ identifier: email })` — a
sign-IN, which fails for an email Clerk has never seen (a first-time
claimer). There was no sign-UP path.

### The decision (asked the user)
Keep email, but make it "smart": pre-check eligibility before sending
any link, and add the missing sign-up path. Chosen over removing email
entirely, because a company-domain email is a legitimate, verifiable
signal (and some founders have no LinkedIn/GitHub connected).

### How email verification works (already in identity-match.ts)
An email claim only verifies if:
- Tier 1: it equals the profile's stored `publicEmail`, OR
- Tier 2: its domain matches the profile's `primaryCompanyDomain` AND
  the local-part matches the person's name.
A personal gmail can't verify identity → correctly rejected.

### Changes
1. **`/api/claim/email-eligible`** (new POST route) — `{ e, email }` →
   reuses `matchConfidence({provider:"email",...})` and returns only
   `{ eligible }`. Lightly IP-rate-limited (no email-enumeration oracle,
   no profile internals leaked).
2. **ClaimProfileModal.startEmailLink** — now:
   - pre-checks eligibility; if not eligible, shows a helpful message
     ("use your company email, or LinkedIn/GitHub") and creates NO
     Clerk account.
   - if eligible: tries `signIn.create`; on "account not found" falls
     back to `signUp.create` + `prepareEmailAddressVerification`
     (email_link). So first-timers actually get a link.
3. **localPartMatchesName** (identity-match.ts) — also accepts an
   initials-of-given-names + last-name handle (e.g. "Daniel Rubén
   Odio" → "drodio"). Without this the user's own
   `drodio@storytell.ai` was rejected. Still requires the full surname,
   so it stays specific.

### Verified (live against :3004 eligibility endpoint)
- drodio@storytell.ai → eligible ✓ (handle + company domain)
- daniel@storytell.ai → eligible ✓
- random@storytell.ai → NOT eligible (domain ok, name no) ✓
- drodom@storytell.ai → NOT eligible (different surname) ✓
- drodio@gmail.com → NOT eligible (personal) ✓
- `pnpm tsc --noEmit` clean.

### Not fully testable locally
The email-link sign-UP round-trip needs a real email click. The
landing (`/claim/sso-callback`) already handles email-link completion
for sign-in and sets signUp force-redirect, so sign-up should complete
the same way. Worth a real end-to-end test on a deploy.

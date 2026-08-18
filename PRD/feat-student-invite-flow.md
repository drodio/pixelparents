# feat/student-invite-flow

Round 3 (Aug 17 walkthrough + Ava's follow-up), the flow restructure. Stacked on
feat/profile-steps (#216), which is stacked on fix/wizard-sticky (#217) —
merge order 217 → 216 → this.

## Progress Update as of [August 18, 2026 — 12:40 AM Pacific]

### Summary of changes since last update

First entry. Parents onboard THEMSELVES first, start to finish; adding a
student is now an optional, lightweight invite at the END of the flow. The
student completes their own profile — the parent never fills out a child form
during onboarding. Plus the walkthrough's copy and light-mode fixes.

### Detail of changes made:

- **Step order (builder + tests):** parent flow is now verify → city → socials
  → interests → photos → share → **students** → invite. The children step is
  GONE from onboarding (the /family editor stays, per Ava's ruling — also the
  only home for non-OHS children). Self-signup students keep parent-link right
  after verify; INVITED students (alreadyLinked) skip it entirely.
- **`student-invite-step.tsx` (new)** — parent enters ONLY first name, last
  name, the student's OHS email, optional phone. Already-invited students list
  at the top with a "they'll finish their own profile" line.
- **`inviteStudent` (new server action)** — OHS-address-only validation (Ava's
  ruling: the invite address doubles as the verification address), creates the
  student's signup row INSIDE the parent's family (auto-linked by construction:
  same familyId; extra.accountType=student, extra.invitedBySignupId=parent),
  re-invite resends rather than duplicating (dup rows are the walkthrough's own
  bug class), then emails the student their private /signup/thanks?id= setup
  link. Email failure degrades to added-but-tell-them, not a hard error.
- **`notifyStudentInvite` (new, lib/email.ts)** — plain-text, matches the
  co-parent invite pattern; no PII committed anywhere.
- **Invited student's landing:** "You were invited by <parent full name> —
  your accounts are already linked." above the wizard (inviterNameFor resolves
  extra.invitedBySignupId), no parent-link step, verification against the same
  OHS address the invite went to.
- **Copy (walkthrough):** the basics submit button says "Continue →" for every
  role (the old "Add Your Child(ren)/Parent" labels promised steps that no
  longer follow); verify success drops the "approved for the OHS directory"
  jargon for "You're all set — keep going."; the WhatsApp/email alternative is
  text-sm with an always-on underline — findable and obviously a link.
- **Light mode (walkthrough frames):** the verify inputs' placeholder uses
  Tailwind's MODIFIER syntax (placeholder:text-white/30) which the override
  sheet's plain-utility rule never matched — now covered; emerald notice text
  darkened to readable emerald-700s; the landing tile mosaic gets a scoped
  darker text color + higher layer opacity in light mode (global mappings
  untouched).

### Verification run

- typecheck / lint / test / build all exit 0 per-step; 1056 tests (1055 stack
  baseline; two order tests rewritten in place, one new invited-student case).

### Potential concerns to address:

- **Email delivery is the load-bearing link** — if the mailer is down the
  student still exists (parent sees them listed) but never gets the URL; the
  degraded message says so. A "resend invite" affordance on /family is the
  natural follow-up.
- The invited student's row is a draft the STUDENT completes via the row-id
  capability URL — same trust model as every thanks-flow surface. The OHS-only
  address rule means the capability link only ever goes to a school inbox.
- Verification cutoff interplay unchanged: invited students still verify their
  own OHS email; the manual-approval backstop applies as before.
- Not live-clicked; the full invite loop (parent sends → email arrives →
  student completes) needs a real pass with mail delivery — on Ava's QA list.

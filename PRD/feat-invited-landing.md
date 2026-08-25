# feat/invited-landing

Round 5 (Aug 24 doc, Ava's spec + three screenshots), PR A of three: the
invited-student first visit, done right — plus the onboarding-completed marker
the mode logic always needed.

## Progress Update as of [August 24, 2026 — morning Pacific]

### Summary of changes since last update

First entry. Picture 3 of the doc showed an invited student's FIRST visit
landing on the returning-editor layout. Root cause: wizard-vs-editing was still
inferred from data presence, and an invited student INHERITS the family's data
(children rows) — so their fresh account looked like a returning editor. The
page now keys off an explicit `extra.onboardedAt` marker, and invited students
get the spec'd dedicated welcome screen before the wizard.

### Detail of changes made:

- **`sendWelcomeAfterOnboarding`** — stamps `extra.onboardedAt` FIRST and
  unconditionally (reaching the welcome screen IS completing onboarding),
  independent of whether the welcome email succeeds; the email keeps its own
  `welcomeSentAt` guard.
- **`page.tsx` mode logic** — `inWizard = Boolean(step) || invitedPending ||
  (!onboarded && !hasExistingData)`. The marker is authoritative;
  data-presence remains only as the legacy fallback for accounts that finished
  before the marker existed. `invitedPending` = has `invitedBySignupId`, no
  marker yet.
- **Dedicated welcome interstitial** — invited student, first visit, no
  ?step=: full-screen "Welcome, [Student]! [Parent full name] invited you to
  join GoPixel — your account is already linked to theirs." One button, "Set
  up my profile →", which enters the wizard with ?step= (also pinning wizard
  mode). Fallback copy when the inviter row is gone.
- **Verification pre-fill** — invited students' OHS address (the invite
  address) pre-fills the code field via a new `defaultEmail` prop; they never
  retype it. Self-signup students are unaffected (their contact email may not
  be their OHS address).

### Verification run

- typecheck / lint / test / build all exit 0, per-stage via pipestatus;
  1062 tests (no new: mode logic + a server-rendered interstitial with no harness).

### Potential concerns to address:

- Acceptance criteria from Ava's spec that need her live pass: link opened
  twice mid-flow resumes; after FINISHING, reopening the link shows the
  editing layout (now true by marker); the parent-signed-in-device edge case
  (her spec left it open) currently proceeds as the student's setup — the
  capability URL is the authority.
- Legacy members (pre-marker) keep the data-presence fallback forever; if that
  ever bites, a one-time backfill (`onboardedAt` for every completed signup)
  retires it.
- The interstitial renders for every visit until onboarding completes —
  deliberate: the one button is the resume path, and ?step= links inside the
  wizard bypass it.

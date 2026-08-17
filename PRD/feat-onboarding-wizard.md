# feat/onboarding-wizard

Third branch of the "Go Pixel Changes V2" round — the core ask: "the parts of
the onboarding essentially need to be broken down into different pages and flow
through, instead of one continuous webpage for the entire process."

## Progress Update as of [August 16, 2026 — 8:55 AM Pacific]

### Summary of changes since last update

First entry. The post-signup /signup/thanks page becomes a paged wizard for
FRESH signups: verification first (per the V2 flow), then the role step
(children for parents, parent/guardian for students), then sharing, then the
invite — every step individually skippable, current step in ?step= so refresh
resumes. Returning editors keep the existing single-page layout untouched.

### Detail of changes made:

- **`onboarding-steps.ts` (new, pure)** — `buildOnboardingSteps` is the single
  source of the step ORDER, which is the product spec: verify → role → share →
  invite. Role-aware titles/blurbs (parent verify wording says "your child's
  OHS student email" — Ava's ruling: the code mechanism is universal, only the
  wording differs by role). Steps drop out cleanly when they have nothing to
  render (no referral link, no verify state). Unit-tested (8 tests).
- **`onboarding-wizard.tsx` (new, client)** — the paged shell: dot progress
  (each dot is a button, so "skip ahead" to any step is direct), Step n of N,
  Continue / Skip for now / Back, Finish → the same status-aware
  /signup/welcome the single-page Finish used. ALL step children stay mounted
  (hidden attr) so the forms inside keep state + autosave when moving around;
  ?step= is router.replace'd (not push) so browser Back leaves the funnel
  instead of unwinding the wizard.
- **`page.tsx`** — fresh path (!hasExistingData) renders the welcome heading
  ("Welcome to GoPixel, <name>!" + skippable note, per the V2 doc's wording)
  and the wizard, with nodes mapped per step key. Editing path is byte-for-byte
  the old layout (share panel up top, role form with showFinish, verify block
  with the "verify later" link, invite CTA). FamilyForm's showFinish is now
  hasExistingData-only — in the wizard the wizard's Finish is the exit.

### Verification run

- typecheck / lint / test / build — all exit 0, per-step codes. 1042 tests
  (1034 main baseline + 8 new onboarding-steps tests).
- One false alarm worth recording: the first typecheck run failed on
  `.next/types` referencing `app/alumni-paused/page` — STALE generated types
  from a build of the (unmerged) feat/pause-alumni branch in the same working
  copy. This branch's own build regenerates `.next`, after which typecheck is
  clean. If you see a "Cannot find module '../../app/<x>/page.js'" typecheck
  error for a page this branch doesn't have, clear `.next` first.

### Potential concerns to address:

- **Not live-verified in a browser.** The wizard renders inside the authed-free
  /signup/thanks flow which needs a real draft signup id; it typechecks, the
  step logic is unit-tested, and the build prerenders the page, but a click
  -through with a real signup (fresh parent AND fresh student) is genuinely
  needed before trusting it. That QA pass is already on Ava's list.
- The verify panel inside the wizard still carries its own student-oriented
  copy internals (#135 personalization); the step title/blurb around it is
  parent-aware but the panel's inner wording is a follow-up (planned: the
  parent-verification wording pass + WhatsApp manual-confirm fallback via env
  var).
- The V2 spec's finer-grained pages (City & State / socials / interests /
  photos as separate steps, the socials dropdown-adder with Instagram + X, and
  the entry-order share questions) are the NEXT branch — they require
  splitting the 677-line FamilyForm, which was deliberately not rushed into
  this structural PR.
- `useSearchParams` in the wizard: if the build had demanded a Suspense
  boundary it would have failed — it passed, but if a future refactor makes
  /signup/thanks static, the wizard needs wrapping.

# fix/wizard-sticky

Round 3 (Aug 17 walkthrough), the ASAP bug: mid-onboarding, the wizard silently
swapped to the returning-editor layout.

## Progress Update as of [August 17, 2026 — 11:55 PM Pacific]

### Summary of changes since last update

First entry. The wizard no longer evaporates mid-session. Root cause diagnosed
from the walkthrough recording (frame at Chief-timer 06:55 shows the editing
layout — "Test, edit your info here:" + share panel + full child form — where
the wizard's next step should be): the page picks wizard-vs-editing from
`hasExistingData`, recomputed on EVERY server render, and the thanks-flow
actions revalidate this path on every save — so the first saved field flipped
the whole page out of the wizard between two steps.

### Detail of changes made:

- **`page.tsx`** — new `inWizard = Boolean(step) || !hasExistingData`: a
  present `?step=` query param pins the page to wizard mode no matter what data
  exists. Greeting, banner, `showFinish`, and the layout branch all key off
  `inWizard` now. Fresh visits (no step, no data) start in the wizard exactly
  as before; returning editors (no step, has data) get the editing layout as
  before.
- **`onboarding-wizard.tsx`** — stamps `?step=<current>` into the URL on mount
  (router.replace, no scroll), so even an autosave on the FIRST step — before
  any Continue has ever set the param — is protected.
- This very likely also fixes the "incorrect page appearing" noted for the
  STUDENT flow in the same session: same page, same mode flip.

### Verification run

- typecheck / lint / test / build all exit 0 per-step (1047 tests — the #214
  baseline; no new tests: the change is two boolean derivations and a mount
  effect, and the layout branch has no test harness).

### Potential concerns to address:

- A member who genuinely wants the EDITING layout while a stale ?step= URL is
  in their history will land in the wizard; the wizard's Finish and dashboard
  links exit normally, so it's a soft wrinkle, not a trap.
- The real cure is an explicit "onboarding completed" marker (set on Finish)
  instead of inferring mode from data-presence. Deliberately NOT added here —
  the round-3 flow restructure (children step moving to the end, invite-based
  student creation) rewrites this page again, and the marker belongs in that
  design rather than being retrofitted twice in one day.

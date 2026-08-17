# feat/verify-required

First branch of "Go Pixel Changes V2 round 2" (Ava's V2(1) doc, Aug 16). The
wizard's verification step stops being skippable and opens on a method chooser.

## Progress Update as of [August 16, 2026 — 6:40 PM Pacific]

### Summary of changes since last update

First entry. Verification in the onboarding wizard is now mandatory with two
explicit methods: email-a-code (advances only on a verified code) or
message-Daniel-on-WhatsApp (advances immediately, explicitly as unverified,
dashboard locked until manual approval). The paired-family blurb is removed and
the panel's wording follows the role.

### Detail of changes made:

- **`onboarding-steps.ts`** — verify step `skippable: false` (Ava: "DO NOT let
  parents or students skip the verification part"). New pure `clampForward`:
  a blocked step can be ENTERED but never PASSED; a blocked current step pins
  you. 5 new tests (4 clampForward + reworked skippable test).
- **`onboarding-gate.tsx` (new)** — tiny context so a step's CONTENT can tell
  the wizard chrome whether advancing is allowed. Context, not a callback prop,
  because step nodes are server-composed and functions can't cross that
  boundary. Null outside the wizard → consumers no-op on /account and the
  editing layout.
- **`onboarding-wizard.tsx`** — provides the gate; Continue disabled +
  "Complete this step to continue." while the current step is blocked; forward
  dot-jumps clamped via clampForward with unreachable dots visually disabled;
  Skip already absent for non-skippable steps.
- **`components/student-verify.tsx`** — in `methodChoice` mode (wizard only)
  the panel opens on a two-option chooser: Email a code / Message Daniel on
  WhatsApp (the second renders only when NEXT_PUBLIC_DRODIO_WHATSAPP_URL is
  set — no contact info in the public repo). The manual step links out, states
  plainly "you can continue — you're unverified and your dashboard stays
  locked until he approves", and reports the gate open. The footer fallback
  link, in wizard mode, routes through the manual STEP (not straight to
  WhatsApp) so the gate learns about it. Blurb "Every GoPixel family is paired
  with an OHS student…" deleted per the doc; new one-line copy is role-aware
  via `selfVerify` (students: "your OHS Stanford address"; parents: "your
  child's OHS Stanford address"). /account + editing layout behavior unchanged
  (methodChoice defaults off).
- **`page.tsx`** — wizard passes `methodChoice` + `selfVerify={isStudentFlow}`;
  welcome line now says verification comes first, everything after is
  skippable.

### Verification run

- typecheck / lint / test / build — all exit 0 per-step (1047 tests: 1042
  baseline + 5 net new).

### Potential concerns to address:

- **The manual choice is client-state only.** Refresh mid-wizard forgets it —
  the member re-clicks the WhatsApp option to advance again. Deliberate for
  now: persisting it means a sanitizer key + server write for what the
  approval flow already tracks authoritatively. Revisit if families complain.
- One-paint race: the gate starts unblocked until the verify panel's mount
  effect reports in. A superhuman double-click could advance before the effect
  runs; harmless (they can be walked back), not worth a synchronous layout
  effect.
- The gate key is the string "verify" in two files (steps builder + panel). A
  constant would be sturdier; left as-is to keep the diff small — flagged for
  the UI revamp pass.
- NEXT_PUBLIC_DRODIO_WHATSAPP_URL still needs the real wa.me/group link set in
  Vercel (Ansh) — with it unset, the chooser collapses to email-only, which is
  a safe degradation.

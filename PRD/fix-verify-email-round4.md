# fix/verify-email-round4

Round 4 (Aug 18 walkthrough): the verification email never arrived while the
welcome email did — plus the verify-screen de-clutter, resend button, red-error
Continue, welcome-email timing, and the landing "33" copy.

## Progress Update as of [August 18, 2026 — 7:40 PM Pacific]

### Summary of changes since last update

First entry. Found a real silent-failure path in the mailer wrapper (the likely
root cause of "we sent a code" with no code): the Resend SDK does NOT throw on
API failures — it RESOLVES with an `error` object, and `sendEmail` never
checked it, so a rejected send returned true. Now checked, and every send
outcome is logged with the Resend message id (recipient DOMAIN only, no
addresses) so Ansh can trace specific sends in the Resend dashboard. Plus the
full round of UX changes Ava specified frame-by-frame.

### Detail of changes made:

- **`lib/email.ts`** — `sendEmail` now fails on `res.error` (previously
  ignored → phantom success) and logs `email.sent` / `email.send_failed` with
  `resendId` + `toDomain` via logEvent. The welcome template is rewritten for
  its NEW timing (below): "your profile is set up" + the permanent edit link,
  subject "Welcome to GoPixel — you're all set". DRodio's personal outro kept
  verbatim.
- **Welcome email moved to onboarding COMPLETION** (Ava: "should NOT have been
  sent until AFTER I complete the profile"). Both completeSignup-time call
  sites removed; new `sendWelcomeAfterOnboarding` (guarded by
  `extra.welcomeSentAt`, retried on next visit if the send fails) fires from
  the /signup/welcome screen — reaching it IS completing onboarding. Admin
  notifications (new-signup, verify-profile) stay at signup time; only the
  applicant-facing welcome moved.
- **Resend button, 15s** — code screen: "Didn't get it? Check spam — you can
  resend in Ns" counting down, then a Resend code link. `RESEND_COOLDOWN_MS`
  lowered 30s → 15s (Ava chose 15) so the server floor matches the visible
  timer and the button never unlocks into a "please wait" error. Resumes hot
  (15s) when landing on an already-pending code.
- **Verify screen de-clutter** (frame-confirmed highlights): the step blurb is
  gone; in the wizard's method-chooser view the panel's inner heading +
  explainer line are gone (title + two cards only); the Email-a-code card
  drops "— verified on the spot". Non-wizard surfaces (/account) keep their
  heading.
- **Continue: red error instead of a pre-printed note** — the button looks
  normal; clicking while unverified shows "Complete this step to continue." in
  red (aria-live), clearing on verify or step change. The wizard blurb line
  renders only when non-empty.
- **Landing copy (option A + breakdown)** — "Join 33 **other community
  members** in the Stanford OHS community", with the sub-line now "X parents
  and Y students, connecting around N shared interests". New
  `getCommunitySplit` uses the same completed-only predicate as
  getSignupCount, so the split always sums to the headline.

### Verification run

- typecheck / lint / test / build all exit 0 per-step; 1062 tests.
- Confession with a moral: the FIRST pass here printed green exit codes that
  were actually `tail`'s, not npm's — the exact chained-off-a-pipe trap this
  repo's own PRDs warn about — and it hid a real lint error
  (set-state-in-effect in the wizard's error reset; now derived state, no
  effect) and a real test failure (asserting deleted blurb copy; now pins the
  empty blurb). Re-run with `pipestatus` per stage. If you're verifying this
  branch yourself: check stage exit codes, never the tail of a pipe.

### Potential concerns to address:

- **The SDK-error guard may or may not be THE delivery failure Ava hit** — it
  is a real bug either way, but Resend may also have accepted the send and
  Stanford's gateway quarantined it. The new email.sent/email.send_failed log
  events + Resend ids give Ansh the trace to answer that definitively in the
  Resend dashboard; until a code email is confirmed delivered to an
  @ohs.stanford.edu inbox, treat deliverability as unproven.
- The welcome email now depends on reaching /signup/welcome — a member who
  abandons mid-wizard never gets it. That is the requested behavior.
- logEvent inside sendEmail adds a DB write per email; volume is tiny and the
  trace value right now is high. Revisit if email volume ever grows.

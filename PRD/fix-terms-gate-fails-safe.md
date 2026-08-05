# fix/terms-gate-fails-safe

Follow-up to #202. The terms checkbox hard-disabled the submit button; this makes
it fail safe instead.

## Progress Update as of [August 5, 2026 — 10:34 AM Pacific]

### Summary of changes since last update

Terms are now enforced INSIDE onContinue with a visible inline error, rather than
by disabling the submit button. typecheck / lint / test (978) / build all exit 0.

### Why this changed within an hour of shipping #202

#202 shipped `disabled={... || !v.termsAccepted}`. Verifying it on production, I
could confirm the checkbox renders, starts unchecked, and correctly disables
submit — but I could NOT confirm that ticking it re-enables submit, because the
browser pane was hidden and neither `element.click()` nor a synthetic
`MouseEvent('click')` fires React's `onChange` for a controlled checkbox. (Proof
it's React-controlled: after one attempt React re-rendered and reverted the DOM
to match its own state.)

So the one transition that matters was unverifiable — on a flow this session has
already broken twice, gating the ONLY way to complete signup.

A disabled submit is also just worse UX. It's a dead end: no explanation, and if
the state were ever wrong the member is silently unable to sign up with nothing
to act on. That is precisely the failure shape of both earlier signup outages
(the builderInterest dead-end showed "fix the highlighted fields" with no field;
the BotID block showed a retry that could never succeed).

### Detail of changes made:

- Submit is no longer disabled by terms — only by `submitting` / a failed save.
- `onContinue` checks acceptance first and, if missing, sets BOTH a field-level
  error and the form-level message, then scrolls the checkbox into view (on a
  phone it sits below the fold, so an error the member can't see is no better
  than a disabled button).
- The checkbox gained `id="termsAccepted"` for that scroll target, and renders
  `<FieldError>` inline.
- Acceptance is still recorded identically (`terms_accepted_at` + version), and
  completion is still impossible without it — the enforcement just moved from a
  dead control to an explained one.

### Potential concerns to address:

- Still not verified with a REAL click. But the failure mode is now benign: worst
  case a member sees "Please agree to the community terms to continue" and ticks
  the box, instead of facing a button that does nothing.
- Server-side, `completeSignup` does NOT require terms — a crafted request could
  skip it. Acceptable for now (the record is what matters legally, and the UI is
  the only client), but a server check belongs here eventually.

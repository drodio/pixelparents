# fix/signup-builder-interest-deadend

**P0 hotfix for a regression I introduced in #196.**

## Progress Update as of [August 2, 2026 — 8:28 PM Pacific]

### Summary of changes since last update

#196 removed the "Are you interested in helping us build GoPixel software?"
question from signup, but `completeSignup` still hard-required it. Every new
signup therefore failed with **"Please fix the highlighted fields above"** while
rendering **no field errors** — an unfixable dead end, because the field it
wanted was no longer on the page. Found by finishing the end-to-end production
pass that #196 shipped without.

### How it was found

The verification #196 explicitly deferred. Drove the live production form on a
**390x844 mobile viewport** with real typing:

- All four fields saved correctly (status showed "Saved"), and the row landed in
  the DB with `ohs_affiliation` null — the intended new behavior.
- Submit did nothing. No navigation, no field errors, and only a generic
  "Please fix the highlighted fields above" in the DOM.
- `app/signup/actions.ts` had
  `if (!BUILDER_INTEREST.includes(extra.builderInterest)) errors.builderInterest = …`.
  `empty.builderInterest` is `""`, so this failed for **every** new account.

Incidental but useful: `resize_window` is the fix for the browser pane wedging at
a 0x0 viewport (which had blocked `read_page` and coordinate clicks for several
rounds).

### Detail of changes made:

- `app/signup/actions.ts`: dropped the `builderInterest` requirement from
  `completeSignup`. `BUILDER_INTEREST` is still imported — `sanitizeSignupPatch`
  uses it to validate the value when it IS supplied.
- `lib/profile-completeness.ts`: builder interest is now a profile gap
  (`key: "builder"`), so it's still collected — just after account creation
  rather than as a submission blocker. It powers the landing-page builder counts.
- `app/(authed)/family/member-card.tsx`: added the builder-interest radio group.
  **Required, not optional** — the dashboard nudge links to `/family`, so without
  an editor there the new gap would have been a dead link.
- `lib/profile-completeness.test.ts`: +1 regression test asserting a missing or
  blank builder answer is a GAP and never a blocker.

### Verification run

- `typecheck` 0, `lint` 0, `test` 0 (**910**), `build` 0.
- Production, pre-fix: account creation + all four field saves confirmed working
  on mobile; submit confirmed broken. Post-deploy re-test still required.

### Potential concerns to address:

- **Any account created between the #196 and this deploy is stuck**: the row
  exists with data but never completed (no `extra.notified`, no approval seed).
  Worth querying for rows created in that window and finishing them manually.
- The root cause is a class of bug, not a one-off: `completeSignup` validates
  against fields the form no longer renders. Anything else removed from signup
  later must be checked against BOTH `signupSchema` AND the extra `errors.*`
  checks in `completeSignup`.
- The submit button still reads "Add Your Child(ren) →" on a page that only
  creates an account.

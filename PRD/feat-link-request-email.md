# feat/link-request-email

Readiness pass before opening signup to new families, plus the one real gap it
surfaced.

## Progress Update as of [August 3, 2026 — 10:04 PM Pacific]

### Summary of changes since last update

Ran a full readiness audit against production: all 17 routes healthy, and a
**complete student signup verified end-to-end on the live site** (the check that
had been deferred for several rounds). Closed the one gap that would actually
block a family: a link request was in-app only, so the person being asked never
found out. typecheck / lint / test (**953**) / build all exit 0.

### Readiness audit — what was actually verified on production

- **All 17 routes return 200** unauthenticated: `/`, `/signup`, `/sign-in`,
  `/sign-up`, `/builders`, `/developers`, `/docs`, `/changelog`, `/privacy`,
  `/terms`, `/report`, `/dashboard`, `/community`, `/directory`, `/events`,
  `/resources`, `/family`.
- **Full student signup on the live site, mobile viewport (375x812)**, with real
  clicks and real typing:
  - role → "Your info" heading (the role-aware fix, live)
  - all four fields saved ("Saved", no retry, **no browser-verification block**)
  - submit → **advanced to `/signup/thanks`** with "ReadinessCheck, nice to meet
    you."
  - DB confirms the row with `accountType=student` and **`notified=true`**, i.e.
    `completeSignup` ran the whole path including notifications.
  - Both parent-linking options render on the thanks step.
- **Audit log captured it live** — `signup.draft.created` appears in `app_logs`,
  proving the logging pipeline works against real traffic, not just a probe.
- Test rows deleted afterwards.

This closes out the three recent signup regressions (BotID block, the
builderInterest dead-end, the Account Portal dead links): all verified fixed by a
single real signup rather than by inference.

### Detail of changes made:

- `lib/email.ts`: new `notifyFamilyLinkRequest()`. Deliberately distinct from
  `notifyCoParentInvite` — that one hands a stranger a link to CREATE an
  account; this tells someone who ALREADY has one that a request awaits their
  approval. Copy states plainly that nothing changes unless they approve, and
  that declining is safe.
- `lib/db/family-links.ts`: sends it on request creation, inside `after()` so a
  slow or failing mail provider can never delay or fail the request itself. A
  send failure logs `family.link.email_failed` and is otherwise swallowed —
  the request still stands.

### Potential concerns to address:

- **No in-app notification for link requests yet.** Email is the important
  channel (it reaches people who aren't on the site), but adding the bell
  notification means extending `NOTIFICATION_TYPES`, which has a lockstep test
  pinning the exact list plus an icon map — three files. Worth doing next.
- **Still no unlink.** Splitting a merged family needs admin help. Given how easy
  linking now is, this asymmetry should close before heavy use.
- The link-request email is not rate-limited beyond the 5-pending-request cap, so
  one person could generate 5 emails to 5 different addresses. Low risk, but a
  per-recipient cooldown would be sturdier.
- A completed test signup DID fire the real admin + welcome emails before
  cleanup, so admins may see one "ReadinessCheck" notification. Harmless.
- The wider mobile sweep (dashboard / directory / community / events on a phone)
  is still not done — only signup and the landing page were measured.

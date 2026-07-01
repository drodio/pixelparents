## Progress Update as of [June 30, 2026 — 6:50 PM Pacific]

### Summary of changes since last update
First entry on this branch. Fixed the five verified audit findings in the
changelog + legal + report-modal + email cluster: report-modal focus trap +
background scroll lock, unsubscribe route now reports the real outcome,
subscribe form recovers from network failures, changelog email deep-links clear
active filters + scroll/highlight the target, and the rejection API-decision
email no longer emits a stray blank line. Added unit tests for the email
formatting and the unsubscribe outcome logic. Did NOT touch `lib/changelog.ts`
seeding logic (out of scope for this branch).

### Detail of changes made:
- **Finding 1 (a11y, `app/report/report-dialog.tsx`)**: the open effect now traps
  Tab / Shift+Tab focus within the dialog (cycles first↔last focusable, pins to
  container when nothing is focusable), locks `document.body.style.overflow =
  "hidden"` while open (restored on close), and focuses the first *interactive*
  control (the close button) instead of the non-interactive container div.
- **Finding 2 (`app/api/changelog/unsubscribe/route.ts`)**: extracted a pure,
  exported `resolveUnsubscribe(input, run)` helper returning
  `"unsubscribed" | "not-found" | "error"`. The GET handler now uses
  `.returning({ id })` and inspects the changed-row count. The success page only
  renders when a row was actually marked unsubscribed (200); zero rows shows a
  "link expired / manage your subscription" page (410); `hasDatabase()`-false,
  invalid identifiers, or a thrown update shows a "something went wrong" page
  (500). Errors are still swallowed/logged, never thrown.
- **Finding 3 (`app/changelog/subscribe.tsx`)**: split the single `"error"`
  status into `"invalid"` (regex failure → "Enter a valid email.") and
  `"failed"` (res-not-ok / fetch throw → "Something went wrong — please try
  again."). The submit button re-enables after a failure so the user can retry
  with the same (valid) address; editing the field resets either error to idle.
- **Finding 4 (`app/changelog/timeline.tsx`)**: added a mount + `hashchange`
  effect that, when `location.hash` names a real entry slug, clears the type +
  category filters (so an active filter can't hide the deep-linked entry),
  scrolls it into view (rAF-deferred so the now-unfiltered node exists), and
  briefly highlights it (amber ring, ~2.4s). Added `scroll-mt-24` to entries.
- **Finding 5 (`lib/email.ts`)**: extracted exported `buildApiDecisionEmail`.
  The rejection branch only includes the `Note:` line when a trimmed reason is
  present (spread `...(reason ? ["", "Note: …"] : [])`), so an omitted/blank
  reason no longer leaves a stray double blank line. `notifyApiDecision` now
  delegates to it. Approval copy unchanged.

### Tests / validation:
- Added `lib/email.test.ts` cases for `buildApiDecisionEmail` (no reason, blank
  reason, with reason, approval) asserting no `\n\n\n` double-blank and correct
  Note placement.
- Added `app/api/changelog/unsubscribe/route.test.ts` covering
  `resolveUnsubscribe` (row-changed → unsubscribed, 0 rows → not-found, token
  preferred over email, email fallback, no-DB → error without running, invalid
  identifiers → error, thrown update → error).
- Widened `vitest.config.ts` include to also match `app/**/*.test.ts` (the
  existing glob was `lib/**` only, so the colocated route test wouldn't run).
- `npx tsc --noEmit` clean; `npm run lint` clean; `npm test` 635/635 pass.
- `next build` NOT run in the worktree per instructions.

### Potential concerns to address:
- The changelog page reads entries from the DB, which isn't provisioned in this
  worktree, so the deep-link scroll/highlight (finding 4) was validated by
  tsc/lint/reasoning rather than a live browser preview (an empty timeline can't
  exercise the hash path). Worth a quick manual check against a seeded env.
- The unsubscribe route now returns 410/500 status codes for non-success
  outcomes (previously always 200). Email clients / link scanners generally
  don't care, but noting the status-code change in case anything asserts 200.

## Progress Update as of [June 30, 2026 — 10:00 PM Pacific]

### Summary of changes since last update
Findings 1, 2, 8. Findings 3, 4, 5, 6, 7, 10, 11, 12, 13, 14 already done. Only
9 remains (deferred — needs the non-owned student-verify widget).

### Detail of changes made:
- **Finding 1 (welcome page dead-end)** — `app/signup/welcome/page.tsx` is now a
  status-aware server component: reads `?id=` (passed from the family-form Finish
  link), looks up the signup, and if `readApprovalStatus === "approved"` shows a
  "you're verified — open your dashboard" message; otherwise the pending
  review-email copy. Either way it now always offers a "Go to dashboard →" link so
  it's never a wait-for-email dead-end. family-form's Finish link now includes
  `?id=${signupId}`.
- **Finding 2 (blank early field = dead button)** — `signup-form.tsx` `onContinue`:
  on field-only errors it now sets a top banner ("Please fix the highlighted
  fields above.") AND scrolls/focuses the first errored field (matching DOM id)
  into view, so there's always visible feedback near the bottom submit button.
- **Finding 8 (re-verify shows fake "we sent a code")** — `verify-actions.ts`
  `requestStudentCode`: the already-verified short-circuit now returns
  `{ok:false, error:"This student is already verified — no code needed."}` instead
  of `{ok:true, sentTo}`. The widget's existing `!r.ok` path shows the message and
  keeps the user on the email step, killing the dead-end code screen. Done using
  the existing widget contract (no widget change needed).

### Deferrals:
- **Finding 9 (student-account thanks page shows parent-facing verify copy)** —
  DEFERRED. The only copy lever the widget exposes is `studentNames`, which yields
  third-person "have <name> check their email" — still wrong when the viewer IS
  the student. A proper fix needs a new "self" mode in
  `components/student-verify.tsx`, which is owned by another agent. Noted for that
  agent; no owned-file fix delivers it.

## Progress Update as of [June 30, 2026 — 10:08 PM Pacific]

### Summary of changes since last update
Findings 10, 11.

### Detail of changes made:
- **Finding 10 (co-parent join loses interest suggestions)** —
  `app/signup/join/[token]/page.tsx` now fetches `getInterestPool()` and passes it
  as `suggestedInterests` to SignupForm, matching the primary /signup page.
- **Finding 11 (revoke confirmation flashes then vanishes)** —
  `connected-apps-actions.ts`: dropped `revalidatePath("/account")` from
  `revokeConnectedApp` (and the now-unused import). The query filters
  `revoked_at IS NULL`, so revalidating dropped the just-revoked row and killed
  the client's "Access revoked." confirmation. The AppRow's persistent client
  state now keeps the confirmation until the next natural load. Grant + refresh
  tokens are still burned server-side.

## Progress Update as of [June 30, 2026 — 10:04 PM Pacific]

### Summary of changes since last update
Fixed the enrichment-panel feedback cluster on /family: findings 5, 6.

### Detail of changes made:
- **Finding 5 (opt-in "Building…" forever)** — `family/actions.ts`
  `setEnrichmentOptIn` now runs the build INLINE on enable (was fire-and-forget
  `after()` that the panel never observed), revalidates, and returns
  `{ran, reason, enrichment}`. Removed the now-unused `after` import. The panel's
  `onToggle` consumes it: swaps the optimistic "Building…" for "Profile built.",
  the "Add a LinkedIn/GitHub/website first" guidance on `no-inputs`, or a
  check-back note if a run is already in flight/rate-limited; adopts the returned
  enrichment via `setEnr`.
- **Finding 6 (refresh says done but profile stays stale)** — `refreshEnrichment`
  now also returns the freshly-stored `enrichment`; the panel calls
  `setEnr(r.enrichment)` so the bio/expertise/facts below actually update (React
  kept the mounted client component's stale useState through revalidatePath).

### Potential concerns to address:
- Opt-in now blocks on the enrichment run (a few seconds) instead of returning
  instantly. This is the same inline model the manual Refresh already uses and is
  what makes the feedback truthful; acceptable trade-off. If it ever gets slow,
  option (b) from the finding (poll a status action) is the fallback.
- The edit-form's bio/tags/help useState are still seeded once at mount, so after
  a refresh the *display* updates but opening Edit shows the pre-refresh values.
  Pre-existing behavior (same as onSaveEdit); out of scope for these findings.

## Progress Update as of [June 30, 2026 — 9:58 PM Pacific]

### Summary of changes since last update
Landed the "reused signup form on /family" cluster: findings 7, 13, 14.

### Detail of changes made:
- **Finding 7 (Finish→ bounces returning parents)** — `family-form.tsx` now takes
  a `showFinish` prop (default false). Only `app/signup/thanks/page.tsx` passes it
  (`showFinish`), so the /family editor omits the "Finish →" → /signup/welcome CTA.
- **Finding 13 (share-link copy promises a link /family never surfaces)** —
  `member-card.tsx`: dropped the "and via the share link" clause from the "OHS
  Families" visibility explainer. The share link/copy button only exist on
  /account (own signup), so the page now only promises what it delivers.
- **Finding 14 (add-child fails silently)** — `family-form.tsx`: `onAddChild` now
  sets an inline `addError` ("Couldn't add a child — please try again.") when
  `addChild` returns a non-{id} shape, rendered under the button.

## Progress Update as of [June 30, 2026 — 9:53 PM Pacific]

### Summary of changes since last update
First commit on the branch. Started fixing the 14 verified QA findings in the
account/family/signup bucket (scratchpad/qa-accountfam.md). This commit lands the
LinkedIn-cluster fixes on /account (findings 3, 4, 12).

### Detail of changes made:
- **Finding 12 (LinkedIn host check)** — `app/(authed)/account/linkedin.ts`:
  `validateLinkedinUrl` now requires the parsed host to be `linkedin.com` or a
  `*.linkedin.com` subdomain (www./country subs allowed), with a clear message.
  Previously any http(s) host with a dot was accepted and mislabeled "LinkedIn".
- **Finding 4 (type="url" blocks scheme-less input)** — `linkedin-panel.tsx`:
  changed the input from `type="url"` to `type="text" inputMode="url"` so the
  scheme-less value the server explicitly upgrades ("linkedin.com/in/x") is no
  longer blocked by the browser's native URL validation before submit.
- **Finding 3 (LinkedIn "reach you" promise is false by default)** —
  `linkedin-panel.tsx` + `page.tsx`: LinkedinPanel now takes a `visibleToFamilies`
  prop (visibility === "ohs" AND "links" share field enabled). After a save, if a
  URL is saved but not actually visible, the panel shows an amber hint telling the
  parent to enable link sharing + OHS visibility below. Header copy softened so it
  no longer promises reachability the field can't deliver on its own.

### Remaining findings (to do this branch):
- 1 welcome page status-aware; 2 signup scroll-to-error; 5 enrichment opt-in
  no-inputs feedback; 6 refresh stale profile state; 7 Finish→ CTA on /family;
  10 join page interest suggestions; 11 revoke confirmation persistence;
  13 member-card share-link copy; 14 add-child silent failure.
- 8 & 9 (student-verify widget) — likely DEFERRED: the fixes need
  `components/student-verify.tsx`, which is owned by another agent.

### Potential concerns to address:
- `linkedin.test.ts` needs a new case asserting a non-LinkedIn host is rejected
  (added with the test pass). Existing scheme-less-upgrade test still passes since
  linkedin.com is allowed.
- The `visibleToFamilies` hint reflects server-loaded state; if a parent flips
  share settings in the same session without reload the hint may lag — acceptable
  best-effort, matches the panel's existing server-prop model.

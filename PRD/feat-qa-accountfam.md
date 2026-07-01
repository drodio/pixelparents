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

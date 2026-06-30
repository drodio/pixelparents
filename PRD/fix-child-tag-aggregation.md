## Progress Update as of [June 30, 2026 — 3:55 AM Pacific]

### Summary of changes since last update
First entry. Fixes the "two records, different tags" bug: a child shown on their
parent's Directory card displayed only the kid-interest tags the parent typed on
the family form, NOT the accurate tags from the child's own linked student
account. We now aggregate (de-duplicated UNION) the child-row interests with the
linked student account's `expertiseSignalsOf` wherever the child's interests
render (Directory cards + the full ProfileView). Also investigated the "This
member hasn't shared a public profile." line (STEP 3) and confirmed it is a
data/UX state, not a residual code bug.

### Detail of changes made:
- Root cause: the same student exists as (1) a `children` row under their parent's
  family (interests = kid-form tags) linked via `children.student_email`, and (2)
  their own `signups` student account (`extra.accountType === "student"`) whose
  accurate tags live in `expertiseSignalsOf` (enrichment expertiseTags +
  skillsets + parentInterests). The Directory card rendered set (1); the Community
  board author card rendered set (2). They diverged.
- `lib/directory.ts`:
  - New `linkedStudentAccountForChild(child, familyStudentAccounts)` — resolves a
    child to its linked student account by matching `child.studentEmail`
    (case-insensitively) against each account's verified OHS emails (reuses
    `verifiedEmailsOf` from `lib/verify`; mirrors the join in
    `lib/family-display.buildFamilyDisplay`).
  - New `aggregatedChildInterests(child, familyStudentAccounts)` — returns the
    de-duplicated UNION of the child's interests and the linked account's
    `expertiseSignalsOf` (child labels first, then new student signals). Returns
    the child's interests unchanged when there is no link. Pure; reuses
    `expertiseSignalsOf` (does not hand-roll signal extraction).
  - `buildDirectoryCard` gained a 6th param `familyStudentAccounts: SignupRow[] = []`
    (defaulted, so existing callers/tests are unaffected) and now uses
    `aggregatedChildInterests` for BOTH the per-child `interests` and the combined
    interest-chip set. All existing share-field gating + student-coarsening rules
    are intact (aggregation only runs inside the `fields.has("children") && !isStudent`
    branch).
- `app/(authed)/directory/page.tsx`: builds a `studentsByFamily` map from ALL
  loaded signups (the student account need not earn its own card) and passes the
  family's student accounts into `buildDirectoryCard`.
- `lib/db/signups.ts`: `getSharedProfileByToken` now also loads the family's
  signups and returns `familyStudentAccounts` on `SharedProfile`, so ProfileView
  can aggregate consistently.
- `components/profile-view.tsx`: the "Children at OHS" section now renders
  `aggregatedChildInterests(kid, familyStudentAccounts)` instead of the raw
  `kid.interests`.
- `lib/directory.test.ts`: added unit tests for `aggregatedChildInterests`,
  `linkedStudentAccountForChild`, and `buildDirectoryCard`'s aggregation (union,
  case-insensitive email match + dedupe, legacy singular `verifiedStudentEmail`,
  unlinked-child passthrough).

### Privacy
- The aggregated student signals are self-entered, non-PII profile facets (the
  same class already shown via the "interests" share field). Aggregation only runs
  where children/interests are already shared; nothing gated off is leaked. No new
  PII surfaces on a card.

### STEP 3 finding (board author card "hasn't shared a public profile.")
- Investigated read-only against live data. For the reported post, the author is
  the STUDENT account, which has `shareEnabled=true`, `shareVisibility='ohs'`, a
  `shareToken`, and an approved/verified family — so `hasShareableProfile()`
  returns TRUE and the author card correctly resolves to "View profile". This is
  NOT a residual code bug; PR #114's fix is present and correct in this base.
- The "This member hasn't shared a public profile." copy only appears when the
  relevant account has NOT enabled sharing (e.g. a parent author with sharing off,
  or a private/unverified account). The remedy is a data/UX action: enable sharing
  ("OHS Families" visibility) on the specific account. The per-account share toggle
  lives on that account's own share settings (its `?id=` thanks/share controls);
  it is reachable per-account, so a student must enable sharing on the STUDENT
  account, not the parent account. We did NOT hack the gate or write to the DB.

### Validation
- `npx tsc --noEmit` — clean.
- `npm run lint` — clean (no new errors).
- `npm test` — 342 passing (30 files), including the new aggregation tests.
- NOTE: `npm run build` is expected to fail in this worktree with a Turbopack
  "symlink points out of filesystem root" error (symlinked node_modules limitation,
  unrelated to this change) — relied on typecheck + lint + test.

### Potential concerns to address:
- `getSharedProfileByToken` now does an extra family-signups query per profile
  view (one small added round-trip). Acceptable; the directory index already loads
  all signups in one query.
- Aggregation is read-side display only — the underlying child row and student
  account remain two separate records (consistent with `family-display`'s
  fold-but-don't-delete model). If a future change unifies them at the data layer,
  this display-time union becomes redundant but harmless.

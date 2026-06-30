## Progress Update as of June 29, 2026 — 10:08 PM Pacific

### Summary of changes since last update
Initial entry for `feat/family-visibility`. Reworked the Family tab to (1) section
members into **Parents & guardians** vs **Students** and DEDUP child rows against
matching student accounts, (2) confirm the LinkedIn/GitHub/Builder fields render
for student accounts too, and (3) add a per-member visibility control any family
member can change, backed by a new family-scoped server action
`setFamilyMemberVisibility`. Extracted the grouping/dedup logic into a pure,
unit-tested `lib/family-display.ts`. Typecheck, eslint, all 210 tests, and the
production build pass.

### Detail of changes made:
- **`app/(authed)/family/actions.ts`** — new server action
  `setFamilyMemberVisibility(targetSignupId, visibility)`. Authorization is FAMILY
  MEMBERSHIP, derived entirely server-side, identical to `patchFamilyMember`:
  caller is the Clerk session (`currentUser` → `primaryEmail`, never a
  client-supplied id); the caller's `family_id` (`familyIdForEmail`) scopes the
  write; the `UPDATE … WHERE id = target AND family_id = caller's` clause IS the
  authorization (a non-member target matches 0 rows → silent no-op,
  `{ ok: false }`). The raw visibility string is coerced server-side via
  `coerceShareVisibility` (so a client can't smuggle an out-of-range value), it
  sets `share_enabled = (tier !== 'private')`, and it mints a `share_token` on
  first enable / keeps the existing one (mirrors `lib/share-actions.ts`).
- **`app/(authed)/family/member-card.tsx`** — added a small `FamilyVisibilityControl`
  (segmented OHS Families / Just me, optimistic + supersede-on-newer-click,
  mirrors `components/visibility-control.tsx` styling) wired to the new family
  action — so ANY family member can change ANY member's visibility (unlike the
  shared control, which uses the owner-only `setShareVisibility` paths). `MemberCard`
  now takes `initialVisibility` and an optional `studentProfile` (grade + interests
  carried over from a deduped child row, shown read-only — the editable source
  stays on the child card). LinkedIn + GitHub username + Builder status block
  already rendered for all members; clarified in the card's doc comment that they
  apply to student accounts too (all optional).
- **`app/(authed)/family/page.tsx`** — renders two groups (Parents & guardians /
  Students), passes each member's coerced `shareVisibility` as `initialVisibility`,
  enriches deduped student-account cards with `studentProfile`, and feeds the
  Children section + photo presigning only the `unmatchedKids`. Added a short note:
  visibility is per-member and any family member can manage everyone's. Uses
  `IconUsers` (no emoji).
- **`lib/family-display.ts`** (new) — pure `buildFamilyDisplay(members, kids, selfId,
  verifiedEmailsOf?)`: sections members (caller-first per group via
  `extra.accountType === "student"`), and folds a `children` row into a student
  account when the child's `student_email` (lowercased/trimmed) matches that
  account's VERIFIED student email (`verifiedStudentEmails` / legacy singular).
  Folded children are hidden from the kids list but NEVER deleted (data-safe).
  `verifiedEmailsOf` is injectable; the page passes the canonical `lib/verify`
  reader (which imports `node:crypto`, so it stays out of this client-safe lib).
- **`lib/family-display.test.ts`** (new) — 10 tests: sectioning + caller-first
  ordering, dedup match (case-insensitive/trimmed), legacy-singular fallback,
  unmatched kids preserved, unverified account does NOT dedup, first-match-wins,
  injected reader.

### Potential concerns to address:
- **Visibility tiers are two, not three.** The task brief described 'link'/'ohs'/
  'private' ("Anyone with link / OHS families / Just me"), but the codebase has
  already REMOVED the public "anyone with link" tier for security — `lib/share.ts`
  `SHARE_VISIBILITY` is `['ohs','private']` and `coerceShareVisibility` downgrades
  legacy `'link'` → `'ohs'`. To avoid regressing that posture, this feature reuses
  the existing two-tier model: the control shows OHS Families / Just me, and the
  new action coerces any incoming `'link'` to `'ohs'`. If a public link tier is
  truly wanted, it must be re-introduced deliberately across `share.ts`,
  `canViewProfile`, the `/p` page, and the directory gate — out of scope here.
- **`extra.accountType === "student"` has no writer yet.** No code currently sets
  it, so the Students section is empty until student signups populate it; the
  dedup + sectioning are forward-compatible and a no-op for existing parent-only
  families.
- **Dedup keys off VERIFIED emails only.** An unverified student account won't
  fold its matching child (by design — verification is the identity link). A child
  with a typo'd `student_email` simply stays a kid.
- Did NOT touch the agent-owned files: `app/(authed)/layout.tsx`,
  `app/signup/thanks/verify-actions.ts`, `app/(authed)/verify/page.tsx`,
  `lib/family-merge.ts`, `.env.example`.

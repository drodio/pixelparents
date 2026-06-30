# Pixel Parents — Progress Log (branch: `feat/family-tab`)
*(Most recent updates at top)*

## Progress Update as of June 29, 2026 — 8:57 PM Pacific

### Summary of changes since last update
First commit on the branch: a new **/family** hub where a signed-in user views and
edits their own profile, their kids, AND every other parent in their family, with a
SECURE cross-account editor. This is the foundational, NON-merge slice of a larger
family system — no family-merging / auto-linking is implemented here.

### Detail of changes made:
- **`app/(authed)/family/page.tsx`** (server, `force-dynamic`) — rendered inside
  `DashboardShell` like the dashboard. `currentUser()` → `primaryEmail` →
  `getFamilyForEmail`. Empty state ("We don't have a family for this account yet")
  when the account has no signup. Renders: a `MemberCard` per parent (caller first,
  then co-parents), the existing `FamilyForm` for the family's kids, the
  `StudentVerify` widget for the caller (via `getVerifyState`), and the info note
  about linking two accounts under the same OHS student email. Presigns child photos
  with `signedPhotoUrls` (mirrors `app/signup/thanks/page.tsx`). Computes the
  "Student" flag per member SERVER-side via `isStudentEmail` (lib/verify.ts imports
  `node:crypto`, so it must stay off the client bundle).
- **`app/(authed)/family/member-card.tsx`** (client) — one editable profile card
  (firstName, lastName, phone, githubUsername, linkedin handle, ohsAffiliation,
  country/city/state, parentInterests). Email is the identity key → shown read-only.
  Country/state interaction mirrors the signup form (state only for US; switching
  away clears state in the same save). Auto-saves via `useAutoSave` + `SaveStatus`
  → `patchFamilyMember`. Reuses `TagPicker` from the thanks family form. Labels the
  caller "You" and any member whose login email is an OHS student email "Student".
- **`app/(authed)/family/actions.ts`** (`"use server"`) — `patchFamilyMember(targetSignupId, patch)`,
  the SECURE cross-account editor. Authorization is entirely session-derived:
  (1) caller = `currentUser()` → `primaryEmail` (NEVER a client-passed id);
  (2) caller's `family_id` via `familyIdForEmail`; (3) patch sanitized by the SHARED
  `sanitizeSignupPatch` helper; (4) `UPDATE … WHERE id = target AND family_id =
  caller's family_id` — a non-member target matches 0 rows → `{ ok: false }`. Email
  is stripped before sanitizing (identity key, not editable via this path).
- **`app/signup/actions.ts`** — extracted the field-sanitizer out of `patchSignup`
  into an exported `sanitizeSignupPatch(rowId, patch)` so `patchSignup` and
  `patchFamilyMember` can't drift. `patchSignup` now delegates to it; behavior is
  unchanged (it still authorizes by UUID, which is fine for its self-edit/admin
  callers). The `extra` read-modify-write (builderInterest / studentResourceOptIn)
  reads the row about to be UPDATEd.
- **`lib/db/signups.ts`** — added `getFamilyForEmail(email)` (`ensureFamiliesSchema()`
  first, resolve caller via `getSignupByEmail`, then load all signups + all children
  with that `family_id`, ordered by created_at) and `familyIdForEmail(email)` (SELECT
  family_id, lower(email) match, most-recent-wins, after `ensureFamiliesSchema()`).
- **`components/icons.tsx`** — new `IconHome` (a simple house) so Family has a
  distinct nav icon from the Directory's `IconUsers`.
- **`components/dashboard-shell.tsx`** — added `{ href: "/family", label: "Family",
  Icon: IconHome }` to `NAV` (between Dashboard and Directory).
- **`proxy.ts`** — added `/family(.*)` to `isProtectedRoute` so unauthenticated
  visitors are redirected to sign-in.

### Validation:
- `npm run typecheck` — clean.
- `npx eslint` on all changed files — clean.
- `npm test` — 170/170 passing (17 files).
- `npm run build` — compiled successfully; `/family` appears as a dynamic route and
  the Clerk middleware (Proxy) compiles. (The only build warning is the pre-existing
  workspace-root inference notice, unrelated to this change.)

### Potential concerns to address (future work, intentionally out of scope here):
- No new DB columns were needed (reuses existing columns + the `extra` jsonb). If a
  column is ever added it MUST go in `ensureFamiliesSchema()` and the read paths
  already self-heal.
- Family MERGING / auto-linking is NOT implemented — the page only displays the info
  note explaining that two accounts merge when both verify under the same OHS student
  email. The actual merge mechanism is a separate, later PR.
- `patchSignup` still authorizes by UUID alone (documented as a known limitation in
  its comment). Cross-account edits go exclusively through the session-derived,
  family-scoped `patchFamilyMember`.
- The /family route is auth- + DB-gated and the worktree has no `.env.local`, so it
  was validated via typecheck/eslint/tests/build rather than a live browser session.

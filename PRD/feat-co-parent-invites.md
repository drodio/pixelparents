# feat/co-parent-invites — Co-parent invites + shared family

## Progress Update as of June 28, 2026 — 2:50 PM Pacific

### Summary of changes since last update
First entry. Built the full "co-parent invites + shared family" feature on a clean
branch off `main`: a new `families` table + shared `familyId` so two (or more)
parents can belong to the same family and share the same children, while each
parent stays its own editable `signups` row. Added the invite UI (with a custom
in-app confirm dialog), the invite email, the join flow, family-based children
loading everywhere (step-2 edit, admin, /p share page), and a safe, backfilling
migration. `tsc --noEmit`, `eslint`, and `vitest` (38 tests) all pass clean.

### Detail of changes made
- **Schema (`lib/db/schema/signups.ts`)**: new `families` table (`id`,
  `createdAt`, unique `inviteToken`); added non-null `familyId` to `signups` and
  to `children` (kept `children.signupId` as provenance — who first added the
  child). Added `FamilyRow` type.
- **`lib/family.ts` (new)**: `generateFamilyInviteToken()` (24 random bytes,
  base64url — same recipe as the secret share token), `createFamily()`,
  `getFamilyByInviteToken()`, `joinUrlFor()` (builds
  `https://pixelparents.org/signup/join/<inviteToken>` via the existing
  `getBaseUrl()` convention).
- **`lib/invite.ts` (new)**: `parseInviteEmails()` + `MAX_INVITES`. Lives outside
  the `"use server"` actions module so the client form can import it (a
  `"use server"` file may only export async actions).
- **`app/signup/actions.ts`**: `createDraftSignup` now mints a family first and
  links the new signup to it (every signup always has a family). New
  `createCoParentDraft(token)` resolves a family by invite token and attaches a
  NEW signup to that EXISTING family. `submitSignup` (legacy/unused path) also
  creates a family so it can't violate the NOT NULL. New `sendCoParentInvites(
  signupId, emails[])` server action parses/validates the emails, looks up the
  signup's family + inviteToken, and emails each address the join link.
- **`lib/email.ts`**: new `notifyCoParentInvite()` template (who invited them +
  the join link + that they'll be able to edit family/children info). Returns a
  boolean so the action can tally how many sent.
- **Children load by family**: `getSignupForEdit` + `getSharedProfileByToken`
  now load children by `familyId`. Admin `page.tsx` groups children by
  `familyId` and attaches the same kids to every parent row in that family.
  `addChild` stamps both `signupId` (provenance) and the family's `familyId`.
  `patchChild`/`removeChild` are re-scoped: authorized by family membership
  (child must be in the same family as the editing signup) so any co-parent can
  edit shared children.
- **Invite UI (`app/signup/signup-form.tsx`)**: label + comma-separated email
  input + "Invite" button placed directly ABOVE the "Continue →" button. On
  Invite a CUSTOM in-app dialog (not `window.confirm`) shows
  `About to send invites to <emails>. They will have the ability to make edits to
  your family and children information.` with `[Yes, invite them]` /
  `[No, cancel]`. Confirm calls `sendCoParentInvites` and shows a sent state.
  The form also takes an optional `joinToken` prop — in "join mode" its lazy
  draft creation uses `createCoParentDraft` so the invitee joins the shared
  family.
- **Join route (`app/signup/join/[token]/page.tsx`, new)**: resolves the invite
  token → family (friendly error if invalid), then renders the step-1 form in
  join mode. After completing, the invitee lands on their own
  `/signup/thanks?id=<newId>` with the shared children already present.
- **Migration (`lib/db/migrations/0001_supreme_mephisto.sql`)**: HAND-EDITED.
  drizzle-kit's auto-diff bundled unrelated drift (the committed `0000` snapshot
  was stale — admins/changelog/share columns had been applied to prod via
  `db:push` without migrations), which would have failed on live data. Rewrote
  the SQL to do ONLY the families change and to BACKFILL before enforcing NOT
  NULL: (1) create `families`; (2) add nullable `family_id`; (3) per existing
  signup insert a family with a generated token + link it, then set each child's
  `family_id` from its parent; (4) `SET NOT NULL` + add FKs. Every statement is
  idempotent. The regenerated `0001_snapshot.json` now captures the full current
  schema (a good side effect — future diffs will be clean).

### Potential concerns to address
- **Migration must be applied on deploy** (not run here against any real DB).
- **Family-level scalar fields stay per-parent** for this PR (city/state,
  parentInterests, family photos live on each `signups` row). Only CHILDREN are
  shared. Moving scalars to the family is a deliberate follow-up, not in scope.
- **Delete cascade**: deleting a signup cascades children by `signupId` FK. In a
  shared family, children a co-parent originally added (their `signupId`) would
  be removed if THAT parent is deleted, even though other parents still reference
  the family. Consider re-pointing the cascade (or soft-delete) as a follow-up.
- **Admin "Children" deep-link**: the parents-table child link still points at
  `/admin/children?parent=<thisRow>` which filters by `signupId`; for a child
  surfaced on a co-parent row (different `signupId`) the filtered view won't list
  it. Cosmetic; the Children COLUMN itself is correctly family-based.
- **No auth model change**: editing is still gated by possession of the secret
  `?id=` link; family + children are editable from any family member's link.

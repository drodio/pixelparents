## Progress Update as of [July 8, 2026 — 3:42 AM Pacific]

### Summary of changes since last update
First entry. Implements the meeting/product decision to gate a STUDENT's contact
info behind a 16+ certification: a minor's own contact (their student email) is
masked — the community sees the PARENT's contact instead, with a note — until a
parent certifies the student is 16 or older. A parent certifies directly (a
checkbox on the child card, at signup OR from the Family page); a student can
REQUEST certification, which notifies the parents to approve. Backend, policy,
masking, notifications, and the parent-facing UI are done; the student-facing
"request" BUTTON is a documented follow-up (its server action + notifications
already exist). tsc / lint / build green; new pure-policy tests pass.

### Detail of changes made:
- **Schema** (`lib/db/schema/signups.ts` + self-heal DDL in `lib/db/ensure.ts`):
  new columns on `children` — `age16_status` ('none'|'pending'|'certified',
  NOT NULL default 'none' so existing rows read as masked), plus attribution:
  `age16_certified_by` (the certifying parent's signups.id), `age16_certified_at`,
  and `age16_requested_at` (student's request time). Idempotent `ADD COLUMN IF NOT
  EXISTS`.
- **Pure policy** (`lib/contact-visibility.ts` + test, 9 cases): `coerceAge16Status`
  (fails CLOSED — NULL/garbage → 'none'/masked, never certified), `canShowStudentContact`,
  `resolveStudentContact()` → which email to show (student's own only when
  'certified' + present, else the parent's) + a `usingParentContact` flag driving
  the UI note. Every surface keys off this one helper so none can drift out of policy.
- **Masking applied** (`components/profile-view.tsx` + `lib/db/signups.ts`):
  `getSharedProfileByToken` now also returns a `parentContact` (a non-student
  family member's email/phone). ProfileView matches a student account to its child
  row (by email), resolves the contact, and renders the parent's email/phone + an
  explicit "This is the parent's contact… kept private" note when not 16+-certified.
- **Parent certify path** (`app/signup/thanks/actions.ts` `ChildPatch.age16Certified`
  + `patchChild`): routed through the ID-authorized child patch (NOT the session)
  so it works BOTH during signup (no Clerk session yet) and on /family. Stamps
  `age16CertifiedBy = signupId` + `age16CertifiedAt` on certify; clears on revoke.
- **Parent UI** (`app/signup/thanks/family-form.tsx` ChildCard): a "This student is
  16 or older — show their own contact info" checkbox with an explanatory note;
  when status is 'pending' it shows "Your student requested… check the box to
  approve." Threaded `age16Status` through both child loaders (family + thanks pages).
- **Student request + notifications** (`app/(authed)/family/age16-actions.ts`,
  `lib/db/notifications.ts`, `notifications-client.tsx`): `requestChildAge16`
  (session-authed; verifies the caller IS the student via studentEmail match, sets
  'pending', notifies every parent in the family). New notification types
  `age16_cert_request` / `age16_cert_approved` (guard + icon in lockstep).

### Potential concerns to address:
- **Student-facing "Request 16+" BUTTON is not wired yet** (documented follow-up).
  The `requestChildAge16` action + parent notifications exist, but a student's own
  record renders as a `MemberCard` (deduped student account), not the child card,
  so the button needs member-card viewer/child-id threading. Until then, the flow
  is parent-initiated (parent certifies directly).
- **One-click approve FROM the notification**: the request notification deep-links
  to /family where the parent approves via the checkbox; an inline approve button
  in the notification is a nice follow-up.
- **"Student account" heuristic**: masking matches a student account to its child
  row by `isStudentAccount(signup)` + email; a guardian who signed up with a
  stanford.edu address could be mis-detected as a student (pre-existing heuristic,
  used elsewhere too). Confirm the definition of "student contact" we want to gate.
- On approval we currently DON'T notify the student (dropped the `age16_cert_approved`
  emit when routing certify through patchChild); re-add if desired.
- Masking respects the student's existing share-visibility set (if they didn't
  share email/phone, nothing shows). Confirm that's the intended interaction.

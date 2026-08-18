## Progress Update as of [August 18, 2026 — 2:49 PM Pacific]

### Summary of changes since last update

First entry on this branch. Branched off `main` at `ede494f` (#217) during a
review of the whole #210–#218 batch. The review found one genuine defect: the
end-of-onboarding "Add your student" invite (#218) could mint a SECOND signup
row for an email that already had a GoPixel account, and because
`getSignupByEmail` is most-recent-wins, the new empty row would then shadow the
student's real account. Fixed by making the existing-account lookup global and
case-insensitive, and refusing to silently absorb an account that belongs to
another family.

### Detail of changes made:

- **The bug.** `inviteStudent` (`app/signup/thanks/actions.ts`) guarded against
  duplicates with
  `where(and(eq(signups.familyId, parent.familyId), eq(signups.email, email)))`.
  Two independent flaws:
  1. **Family-scoped.** It only looked inside the inviting parent's own family,
     so an account that already existed in a DIFFERENT family was invisible and
     a fresh row got inserted for the same address.
  2. **Case-sensitive.** `email` is lowercased at the top of the function, but
     `eq(signups.email, …)` compares raw, and the signup form stores whatever
     case the member typed (`app/signup/actions.ts` inserts `data.email`
     verbatim). A student stored as `Name@ohs.stanford.edu` therefore missed the
     check — so even a same-family re-invite could duplicate.
- **Why it mattered.** `signups.email` has no unique index, and
  `getSignupByEmail` (`lib/db/signups.ts`) resolves an address
  `orderBy(desc(createdAt)).limit(1)` — most-recent-wins. The row the invite
  inserted is the newest, so the student's next sign-in resolved to the new,
  empty row, inside the inviting parent's family, with their real profile
  (interests, photos, city, socials, share settings) orphaned. Joining two
  existing families is what the family LINK request flow is for, and that flow
  requires the other side to approve; an invite must not be able to do it
  silently.
- **New pure module `lib/student-invite.ts`** — follows the existing
  `lib/family-links.ts` pattern (rules that could attach someone to a stranger's
  family live in a DB-free, unit-tested module):
  - `looksLikeOhsEmail` moved here from `actions.ts` (was a private function with
    no test) and is now covered, including the lookalike-domain cases
    `notstanford.edu` and `stanford.edu.evil.com`.
  - `decideStudentInvite({ parentFamilyId, existing })` returns
    `create` | `resend` | `blocked`.
- **`inviteStudent` rewired** to look the email up with
  `sql\`lower(${signups.email}) = ${email}\`` across all families — matching how
  every other email lookup in the codebase already works — and to act on the
  decision. `blocked` returns an actionable message pointing at the consent-based
  link flow rather than creating anything.
- **6 new tests** in `lib/student-invite.test.ts`, including an explicit
  regression test for the cross-family case.

### Potential concerns to address:

- **Pre-existing, NOT fixed here:** `signups.email` still has no unique index, and
  the app deliberately tolerates multiple rows per address ("most-recent-wins").
  This fix closes the invite path specifically; other paths that insert signups
  are unchanged. A real uniqueness constraint (or a documented decision not to
  have one) is worth its own issue.
- **Pre-existing, NOT fixed here:** `?id=<uuid>` on `/signup/thanks` is a bearer
  capability — every action in `thanks/actions.ts` (including the new
  `getShareSetupState`) authorizes on UUID validity alone. That is the
  established design across this file, not a regression from this batch, but it
  means anyone holding a signup id can read/modify that signup.
- **Deployment gap flagged by Ava and still open:**
  `NEXT_PUBLIC_DRODIO_WHATSAPP_URL` is unset (`.env.example` has it blank). The
  onboarding verify step is non-skippable, and the WhatsApp manual-approval
  escape hatch only renders when that env var is set — so with it unset, a member
  who cannot receive the OHS code has no way past step 1 of onboarding. Setting it
  in Vercel is what makes the mandatory-verification design safe.
- `inviteStudent` accepts any `stanford.edu` or `*.stanford.edu` address while the
  error copy says `…@ohs.stanford.edu`. Deliberate per the original commit, but
  the copy and the rule do not match.

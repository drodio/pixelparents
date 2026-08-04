# feat/family-account-linking

Two asks, one primitive: let a student skip "invite your parent" when the parent
already has an account, and let anyone link more parent/student accounts from
the Family tab at any time. Both are "join an existing family".

## Progress Update as of [August 3, 2026 — 9:31 PM Pacific]

### Summary of changes since last update

Added two-sided family linking: request → approve → the requester's whole family
merges into the approver's. Surfaced on /family (manage anytime) and on the
student's post-signup step (as the new default, replacing invite-only).
typecheck / lint / test (**953**) / build all exit 0, and the merge itself was
verified against the production database.

### Why this needed a new primitive

The only existing way into a family was an emailed invite TOKEN: the inviter
sends a link, the invitee signs up through it. That cannot express either case
we actually hit:

1. A student signs up and their parent ALREADY has an account. "Invite your
   parent" is nonsense — following it creates a DUPLICATE parent account.
2. Two people who both already have accounts want to become one family later.

### Detail of changes made:

- **`lib/family-links.ts` (pure, 15 tests)** — all the decision rules, isolated
  from the DB because approving grants mutual access to profiles AND children:
  - `canRequestLink()` — rejects self, rejects same-family, validates email.
  - **Account-enumeration guard:** an unknown email returns the sentinel
    `NOT_FOUND`, and the caller answers with `linkNotFoundMessage()` — wording
    identical to the success path. Without this, the endpoint would be an oracle
    for which OHS families are registered. There's a test asserting the copy
    never says "no account" / "not found".
  - `canDecideLink()` — only the person asked, their signup id, OR a co-parent
    in the target family may decide; already-handled requests are rejected.
    Stops anyone holding a request id from approving themselves in.
  - `membersMovedByLink()` — names everyone who moves, and flags when >1 adult
    would, so a co-parent is never relocated invisibly.
  - `canCreateAnotherRequest()` — 5 pending outgoing max, anti-spam.
- **`lib/db/schema/family-links.ts`** — `family_link_requests`
  (from/to/status/decided), indexed for inbox, outbox, and dedupe.
- **`lib/db/family-links.ts`** — create / list incoming / list outgoing /
  approve / decline / cancel, plus self-healing DDL (no migrate-on-deploy here).
  Approval runs ONE transaction that repoints `signups.family_id` AND
  `children.family_id`, closes the request, and cancels now-moot siblings.
  Every step logs to the new audit log (`family.link.*`).
- **`app/(authed)/family/link-accounts.tsx`** — one client component used by
  BOTH surfaces so they can't drift. Incoming requests render first (someone is
  blocked on them) and spell out exactly who joins.
- **`app/(authed)/family/page.tsx`** — new "Linked accounts" section above the
  invite cards. Deliberately separate: invites are for people with NO account,
  linking is for people who already have one.
- **`app/signup/thanks/student-parent-form.tsx`** — a mode toggle. **"They
  already have an account" is the DEFAULT**, since that's the case the step was
  missing and inviting an existing member creates a duplicate. "Invite them"
  keeps the original flow untouched.

### Verification run

- `typecheck` 0, `lint` 0, `test` 0 (**953**, 15 new), `build` 0.
- **Merge verified against the production DB**: seeded two families (student +
  child in one, parent in the other), ran the exact approval transaction, and
  confirmed all three ended up in one family with the request marked approved.
  All probe rows deleted.

### Potential concerns to address:

- **Not yet exercised in a browser.** The merge logic is proven at the DB level
  and the guards are unit-tested, but the UI flow (send → appears in the other
  account's inbox → approve) has not been clicked through by a human. Worth
  doing with two real accounts before telling families about it.
- **Approval moves the requester's ENTIRE family**, not just the requester. That
  is intentional — moving one person would strand co-parents and children in an
  orphaned family — and the UI names everyone. But it IS the biggest blast radius
  in this feature, and a co-parent doesn't separately consent.
- **There is no unlink.** Splitting a merged family needs admin help today.
  Worth building before this sees heavy use.
- The old family row is left behind after a merge (harmless, keeps invite tokens
  valid) but it is now an empty orphan. Cleanup could be added later.
- No email notification on a new request yet — it only appears in-app on
  /family. A parent who never opens the site won't know someone is waiting.

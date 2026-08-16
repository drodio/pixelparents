# fix/family-link-decide-authz

Backlog context: A5/A6 in `gopixel-feedback-plan.md` ("link approval status
stale: one side pending, other approved" / sign-in can't find a linked account).
The full A5/A6 story needs reproduction against real data (see "Potential
concerns"), but code reading surfaced three provable defects in the decide path
itself; this branch fixes those. No schema changes.

## Progress Update as of [August 16, 2026 — 7:27 AM Pacific]

### Summary of changes since last update

First entry. Fixed the family-link decide guard so it actually guards, made
approval merge the requester's family as it exists at approval time rather than
the request-time snapshot, and made moot requests close instead of sticking as
unapprovable "pending" rows. Added `lib/db/family-links.test.ts` (7 tests, mock
recorder in the `signups.test.ts` style); 6 of the 7 fail against the previous
code, all pass now. Full verify suite run with per-step exit codes.

### Detail of changes made:

- **`lib/db/family-links.ts` — decide guard authz.** `canDecideLink`'s third
  argument is the ADDRESSEE's family id, but both `approveFamilyLinkRequest`
  and `declineFamilyLinkRequest` passed the DECIDER's own `familyId`. That made
  the `sameFamily` clause compare the decider to themselves — always true — so
  "This request wasn't sent to you" could never fire. Any signed-in member who
  learned a request id could approve it, and because the merge targets the
  *decider's* family, doing so would absorb the requester's family (profiles
  AND children) into the caller's own. Both call sites now resolve the
  addressee (`findById(req.toSignupId)`) and pass their family, `null` when the
  row is gone (the email/signup-id clauses still admit the real addressee —
  covered by a test where the addressee sits on a new row id with the same
  email).
- **Approval merges live state, not the snapshot.** The transaction repointed
  `WHERE family_id = req.fromFamilyId` — the family captured at request
  creation. If the requester moved families between request and approval (a
  duplicate request approved first, a re-signup), that moved the wrong rows or
  none, while still marking the request approved and reporting "Linked." Now
  the requester is re-fetched at approval time and their CURRENT `familyId` is
  what merges (also used for the moot-request cancellation in the same
  transaction).
- **Moot requests close instead of wedging.** Two paths previously stranded a
  request in `pending` forever, which reads as exactly the walkthrough symptom
  (one side "pending", the other already linked):
  - requester already in the decider's family → was a hard error, forever
    re-showable; now cancels the request and returns ok ("You're already one
    family — we closed this request.")
  - requester row deleted → now cancels the request with an explanatory
    message instead of leaving it live.
- **`lib/db/family-links.test.ts` (new).** Mocked `getDb`/`getSql` recorders;
  fixtures use placeholder emails only. Proven against the unfixed code via
  stash: 6/7 fail before, 7/7 after.

### Verification run

- `npm run typecheck` — exit 0
- `npm run lint` — exit 0
- `npm test` — exit 0, 83 files, 1034 tests (1027 baseline + 7 new)
- `npm run build` — exit 0 (placeholder Clerk keys)
- Exit codes captured per step explicitly (`TYPECHECK_EXIT=` etc.), not chained
  through `tail` — the misleading-green trap noted in the batch-2 PRD.

### Potential concerns to address:

- **This is hardening, not confirmed root cause for A5/A6.** The walkthrough
  reports need reproduction against production data before anyone claims them
  fixed. Suggested checks for someone with DB access: (1) duplicate signups
  sharing one email (`SELECT lower(email), count(*) FROM signups GROUP BY 1
  HAVING count(*) > 1`); (2) pending `family_link_requests` whose
  `from_signup_id`'s current `family_id` no longer equals `from_family_id`
  (stale-snapshot victims); (3) for A6 specifically, emails present in
  `signups` with no matching Clerk user — a family-linked member who never
  created a login would see Clerk's "couldn't find your account" at sign-in,
  which no app-side code change can fix.
- The moot-cancellation still matches on `from_family_id` only. A duplicate
  request sent by the requester's OTHER signup row (different family) stays
  pending by design — cancelling it would strand that row with no way to merge.
  If product wants same-email requests auto-closed on approval instead, that's
  a one-clause change but a real product decision.
- `approveFamilyLinkRequest` now issues one extra `findById` per decision (the
  addressee lookup). Negligible on this path, but it is a new query.

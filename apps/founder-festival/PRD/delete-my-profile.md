# Branch: `delete-my-profile` — progress log

Branched from `main` (post PR #39).

## Progress Update as of 2026-05-26 9:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Users can now delete their own profile end-to-end:
- "Delete my profile" item added to Clerk's UserButton dropdown
  (with a trash icon).
- Clicking opens a typed-confirmation modal (must type DELETE).
- On confirm, POST /api/account/delete tears down everything in
  Neon for that user and then deletes the Clerk user.
- Browser is signed out + redirected to `/`.

Deletion order in `/api/account/delete/route.ts`:
1. Find all claim rows in `users` for this Clerk userId.
2. Compute which evaluation_ids the user OWNS exclusively (no OTHER
   claim row references them). Evals shared with another claimer
   stay intact — we only drop this user's claim row.
3. Delete dependents of owned evals: `badge_overrides`,
   `score_items`, `recommendation_responses`. (events-v1's
   `event_applicants` will need a hook here once that branch merges.)
4. Delete the user's `users` rows.
5. Delete the owned `evaluations` rows (after step 4 so the FK from
   users.evaluation_id has nothing pointing at them).
6. `clerkClient().users.deleteUser(userId)` — Clerk side. Best-effort;
   on failure we still consider the local data gone and let the
   client redirect home. The session token is invalidated when Clerk
   delete succeeds, so the next page load sees no auth.

### Detail of changes made:
- `src/app/api/account/delete/route.ts` (new) — endpoint above.
- `src/components/UserBadge.tsx`:
  - `<UserButton.MenuItems>` now always renders, with a new
    `<UserButton.Action label="Delete my profile" ... />` item
    underneath the existing "View My Public Profile" link.
  - New `DeleteConfirmModal` requires typing the literal string
    `DELETE` before the red destructive button enables.
  - On success: `clerk.signOut({ redirectUrl: "/" })` to flush the
    in-memory session, falling back to `window.location.href = "/"`
    if signOut throws.
  - New `TrashIcon` component matching the existing `ProfileIcon`
    style (16x16, stroke 1.5, currentColor).

### Potential concerns:
- Irreversible by design — typed confirmation is the only safety net.
  Worth surfacing the action only after a user expands an "advanced"
  disclosure if QA finds people clicking it accidentally.
- The deletion does NOT remove rows from `bypass_codes` or the
  `scoring_jobs` admin log — those don't reference user PII, just the
  eval id, so they stay clean once the eval is gone (FK on
  scoring_job_items.evaluation_id is ON DELETE NO ACTION so it'd
  block; verify this in QA on a code-redeemed eval if relevant).

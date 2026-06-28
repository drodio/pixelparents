# Branch: `polish-and-admin-pending` — progress log

Branched from `main` (post PR #21 ai-sdk-rescore-fix merge).

## Progress Update as of 2026-05-25 9:50 AM Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Pile of UI polish across welcome and leaderboard pages plus the Phase 3
admin pending-items queue and the admin-can-act-on-anyone's-page
behavior. Net: admins now have a clear way to resolve owner edits both
from /admin/pending and inline from any /welcome page (with an "Admin"
pill on each row so they know why they can act).

### Detail of changes made:
- **ScoreTable polish** (`src/components/ScoreTable.tsx`):
  - Confidence circle now ALWAYS shows "NN%" (with sign) — not just on
    hover, not just the digits. Circle bumped from h-7→h-8 to fit
    three-char labels like "85%".
  - `title="Probability of being accurate"` tooltip on every circle.
  - Non-owner CTA personalized: "*Are you {firstName}?* Claim this
    profile to add, dispute or modify items." (italic + with comma
    + "add" included). Falls back to the generic copy when no name.
  - New `isAdminViewer` prop: admins see ✓/✏/✗ on every row plus a
    small purple "Admin" pill to the right of the icons.
- **ClaimProfileModal personalization**
  (`src/components/ClaimProfileModal.tsx`): header is now
  "{firstName}, claim your profile" when firstName is known.
- **Leaderboard polish** (`src/lib/leaderboard.ts`,
  `src/components/LeaderboardTable.tsx`):
  - Person's name now followed by ", {Company}" (company NOT bold).
  - Company resolved from `extractedMetrics.partnerAtFirm` first
    (clean human-readable VC firm name), else by capitalizing the
    first segment of `primaryCompanyDomain` (e.g. airbnb.com → Airbnb).
  - Skipped entirely when neither field is present.
  - "Claimed" badge moved INLINE next to the name (was below with the
    other badges). Filtered out of the badges-below list so it doesn't
    double-render.
- **API authorization split**
  (`src/app/api/score-items/[id]/route.ts`):
  - Owner (matchConfidence in high|medium) can still confirm/reject
    rows whose status is "likely" (the AI's original output) and can
    always modify (→ pending).
  - Once a row is in "pending" (owner-edited), only admins can resolve
    it to confirmed or rejected. Prevents owners self-confirming
    arbitrary text edits.
  - Admins can act on any score_items row even if not the owner.
- **Admin pending queue** (`src/app/(authed)/admin/pending/page.tsx`
  + `src/components/admin/PendingItemRow.tsx`):
  - Lists every score_items row with status='pending', grouped by
    evaluation. Each row shows the owner-edited text on top and the
    AI's original below (struck through with the original points).
  - Inline ✓ confirm / ✗ reject buttons on each row. Optimistic UI:
    the row hides itself on success; errors snap back with a message.
  - Linked from admin layout nav: "Pending items".

### Potential concerns to address:
- `companyNameFromDomain` capitalizes only the first letter — so
  "producthunt.com" renders as "Producthunt" not "Product Hunt". The
  cleaner long-term fix is to ask Claude to emit a `primaryCompanyName`
  field alongside `primaryCompanyDomain` in the scoring schema. Cheap
  for now; can revisit if it looks too rough on the leaderboard.
- The /admin/pending API call doesn't refresh the parent page after
  acting (optimistic hide only). If the admin reloads /admin/pending
  the row is gone (because status is no longer 'pending'), which is
  correct, but they won't see the *current* count until reload.
- The "Admin" pill on welcome pages doesn't appear when the viewer is
  BOTH admin AND the owner — `isAdminViewer` is still true in that
  case so they see the pill. Worth keeping (lets the admin spot when
  they're acting in an elevated capacity vs. owner capacity).
